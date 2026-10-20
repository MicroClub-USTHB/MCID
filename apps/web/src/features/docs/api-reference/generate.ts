import GithubSlugger from 'github-slugger';

import { audienceOf, type Audience } from '@/features/docs/api-reference/audience';
import { attributeText, cellText, linkText, mdxText } from '@/features/docs/api-reference/mdx-text';
import { API_PAGE_DESCRIPTIONS } from '@/features/docs/api-reference/descriptions';
import type {
  ApiFile,
  ApiPage,
  OpenApiSpec,
  Operation,
  Parameter,
  Schema,
} from '@/features/docs/api-reference/types';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;
const MAX_ENUM_VALUES = 8;

export function groupSlug(group: string): string {
  return group
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const refName = (ref: string): string => ref.split('/').at(-1) ?? ref;
const byName =
  <T>(key: (item: T) => string) =>
  (a: T, b: T) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;

/** A short, readable type for a schema: `string`, `array of Foo`, `"a" or "b"`, `Foo`. No pipes, which would split a table cell. */
function typeName(schema: Schema | undefined): string {
  if (!schema) return 'any';
  if (schema.$ref) return refName(schema.$ref);
  if (schema.allOf?.length) return schema.allOf.map(typeName).join(' and ');
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (alternatives?.length) return alternatives.map(typeName).join(' or ');
  if (schema.enum) {
    const shown = schema.enum.slice(0, MAX_ENUM_VALUES).map((value) => JSON.stringify(value));
    return shown.join(' or ') + (schema.enum.length > MAX_ENUM_VALUES ? ' or ...' : '');
  }
  let base: string;
  if (schema.type === 'array') base = `array of ${typeName(schema.items)}`;
  else if (schema.type === 'object' && typeof schema.additionalProperties === 'object')
    base = `map of ${typeName(schema.additionalProperties)}`;
  else base = (schema.type ?? 'any') + (schema.format ? ` (${schema.format})` : '');
  return schema.nullable ? `${base} or null` : base;
}

const code = (text: string) => `\`${text}\``;

/** Every schema name reachable from a piece of the document, following references, once each. */
function referencedSchemas(root: unknown, schemas: Record<string, Schema>): string[] {
  const found = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        const name = refName(value);
        if (!found.has(name)) {
          found.add(name);
          visit(schemas[name]);
        }
      } else visit(value);
    }
  };
  visit(root);
  return [...found].sort();
}

function propertiesOf(schema: Schema): {
  properties: Record<string, Schema>;
  required: Set<string>;
} {
  const properties: Record<string, Schema> = {};
  const required = new Set<string>();
  for (const part of [...(schema.allOf ?? []), schema]) {
    Object.assign(properties, part.properties);
    part.required?.forEach((name) => required.add(name));
  }
  return { properties, required };
}

function descriptionOf(schema: Schema): string {
  const own = schema.description ?? schema.allOf?.find((part) => part.description)?.description;
  const fallback =
    schema.default !== undefined ? `Default: ${code(JSON.stringify(schema.default))}.` : '';
  return [cellText(own), fallback].filter(Boolean).join(' ');
}

function propertiesTable(schema: Schema): string[] {
  const { properties, required } = propertiesOf(schema);
  const names = Object.keys(properties).sort();
  if (names.length === 0) return [];
  return [
    '| Field | Type | Required | Description |',
    '| --- | --- | --- | --- |',
    ...names.map((name) => {
      const property = properties[name]!;
      return `| ${code(name)} | ${code(typeName(property))} | ${required.has(name) ? 'yes' : 'no'} | ${descriptionOf(property)} |`;
    }),
  ];
}

const AUTH: Record<string, string> = {
  'session-token': 'Admin session token (`Authorization: Bearer <token>`)',
  'api-key': 'Project API key (`X-API-Key` header)',
};

function authentication(operation: Operation): string {
  const schemes = (operation.security ?? []).flatMap((requirement) => Object.keys(requirement));
  if (schemes.length === 0) return 'None, this endpoint is public.';
  return schemes.map((scheme) => AUTH[scheme] ?? code(scheme)).join(' or ');
}

function parametersTable(parameters: Parameter[]): string[] {
  return [
    '**Parameters**',
    '',
    '| Name | In | Type | Required | Description |',
    '| --- | --- | --- | --- | --- |',
    ...parameters.map((parameter) => {
      const description = [
        cellText(parameter.description),
        parameter.schema ? descriptionOf({ default: parameter.schema.default }) : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `| ${code(parameter.name)} | ${parameter.in} | ${code(typeName(parameter.schema))} | ${parameter.required ? 'yes' : 'no'} | ${description} |`;
    }),
    '',
  ];
}

function requestBody(operation: Operation): string[] {
  const body = operation.requestBody;
  const schema = body?.content?.['application/json']?.schema;
  if (!body || !schema) return [];
  const kind = `JSON, ${body.required ? 'required' : 'optional'}`;
  if (schema.$ref) {
    const name = refName(schema.$ref);
    return [`**Request body** (${kind}): [${name} schema](#${schemaAnchor(name)}).`, ''];
  }
  const table = propertiesTable(schema);
  return table.length
    ? [`**Request body** (${kind})`, '', ...table, '']
    : [`**Request body** (${kind}): ${code(typeName(schema))}.`, ''];
}

const schemaAnchor = (schemaName: string) =>
  `${schemaName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-schema`;

function responsesTable(operation: Operation): string[] {
  const entries = Object.entries(operation.responses ?? {}).sort(byName(([status]) => status));
  if (entries.length === 0) return [];
  return [
    '**Responses**',
    '',
    '| Status | Description | Body |',
    '| --- | --- | --- |',
    ...entries.map(([status, response]) => {
      const schema = response.content?.['application/json']?.schema;
      return `| ${code(status)} | ${cellText(response.description)} | ${schema ? code(typeName(schema)) : ''} |`;
    }),
    '',
  ];
}

function operationBlock(
  path: string,
  method: string,
  operation: Operation,
  group: string
): string[] {
  const title = operation.summary ?? `${method.toUpperCase()} ${path}`;
  return [
    `## ${mdxText(title)}`,
    '',
    `<Endpoint method="${method.toUpperCase()}" path="${attributeText(path)}" />`,
    '',
    ...(operation.description ? [mdxText(operation.description), ''] : []),
    ...(operation.deprecated ? ['**Deprecated.**', ''] : []),
    `**Authentication:** ${authentication(operation)}`,
    '',
    ...(operation.parameters?.length ? parametersTable(operation.parameters) : []),
    ...requestBody(operation),
    ...responsesTable(operation),
    `<SwaggerLink tag="${attributeText(group)}" operationId="${attributeText(operation.operationId)}" />`,
    '',
  ];
}

function schemaSection(name: string, schema: Schema): string[] {
  const table = propertiesTable(schema);
  return [
    `### ${name} schema`,
    '',
    ...(schema.description ? [mdxText(schema.description), ''] : []),
    ...(table.length ? table : [`Type: ${code(typeName(schema))}.`]),
    '',
  ];
}

const AUDIENCES: Audience[] = ['project', 'admin'];

const AUDIENCE_TITLE: Record<Audience, string> = {
  project: 'Project API',
  admin: 'Admin API',
};

const AUDIENCE_DESCRIPTION: Record<Audience, string> = {
  project:
    'For developers of Micro Club projects: log members in, check permissions, use channels and webhooks, and send data to inbound webhooks.',
  admin:
    'What the admin dashboard uses. These endpoints need an admin session and are not meant for projects.',
};

/** Frontmatter is not MDX, so it gets the plain hyphens on its own. */
const plain = (text: string) => text.replace(/\s*[\u2014\u2013]\s*/g, ' - ').trim();

/** YAML frontmatter with JSON-quoted values (valid YAML), so any title or description is safe. */
function frontmatter(title: string, description: string): string {
  return [
    '---',
    `title: ${JSON.stringify(plain(title))}`,
    `description: ${JSON.stringify(plain(description))}`,
    '---',
    '',
    '',
  ].join('\n');
}

function pageDescription(slug: string, fallback: string | undefined, group: string): string {
  return plain(
    API_PAGE_DESCRIPTIONS[slug] ?? fallback ?? `The ${group} endpoints of the MCID API.`
  );
}
const GENERATED =
  '{/* Generated by pnpm docs:api from apps/api/openapi.json. Do not edit by hand. */}';
const SOURCE = 'Source: `apps/api/openapi.json`.';

const INTRO: Record<Audience, string> = {
  project:
    "These endpoints are for the backends and browsers of Micro Club projects. A backend call carries the project's API key in the `X-API-Key` header, and the login endpoints are public because they start a member's sign-in. A few endpoints act on a member's own session and take that member's session token as a Bearer token instead. What a project can do is limited to the servers and operations an administrator granted it.\n\nThe endpoints the admin dashboard uses are in the [Admin API](/docs/api-reference/admin/overview).",
  admin:
    'These endpoints serve the admin dashboard and are not meant for projects. They need an admin session, a system administrator signed in with Discord. The dashboard sends the session as a cookie; in Swagger you give it as a Bearer token.\n\nThe endpoints for projects are in the [Project API](/docs/api-reference/project/overview).',
};

interface Placed {
  path: string;
  method: string;
  operation: Operation;
}

interface GroupPage {
  group: string;
  slug: string;
  /** The Swagger tag's own description, if it has one. */
  tagDescription?: string;
  content: string;
  /** The heading id of each operation on the page, for the overview to link to. */
  anchors: Map<string, string>;
}

function groupPage(
  audience: Audience,
  group: string,
  operations: Placed[],
  spec: OpenApiSpec
): GroupPage {
  const schemas = spec.components?.schemas ?? {};
  const sorted = [...operations].sort(
    (a, b) =>
      (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) ||
      METHODS.indexOf(a.method as never) - METHODS.indexOf(b.method as never)
  );
  const description = spec.tags?.find((tag) => tag.name === group)?.description;
  const used = referencedSchemas(
    sorted.map(({ operation }) => [
      operation.parameters,
      operation.requestBody,
      operation.responses,
    ]),
    schemas
  ).filter((name) => schemas[name]);

  // The same slugger rehype-slug uses, fed in page order, so these ids are the ones the page gets.
  const slugger = new GithubSlugger();
  const anchors = new Map<string, string>();
  for (const { path, method, operation } of sorted) {
    const title = mdxText(operation.summary ?? `${method.toUpperCase()} ${path}`);
    anchors.set(operation.operationId, slugger.slug(headingText(title)));
  }

  const lines = [
    GENERATED,
    '',
    ...(description ? [mdxText(description), ''] : []),
    ...sorted.flatMap(({ path, method, operation }) =>
      operationBlock(path, method, operation, group)
    ),
    ...(used.length
      ? ['## Schemas', '', ...used.flatMap((name) => schemaSection(name, schemas[name]!))]
      : []),
    SOURCE,
    '',
  ];
  return {
    group,
    slug: `${audience}/${groupSlug(group)}`,
    tagDescription: description,
    content: lines.join('\n'),
    anchors,
  };
}

/** What a reader sees of a heading line: links keep their label, inline marks are dropped. */
function headingText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();
}

function overviewPage(
  audience: Audience,
  pages: GroupPage[],
  groups: Map<string, Placed[]>
): string {
  const total = [...groups.values()].reduce((sum, operations) => sum + operations.length, 0);
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

  return [
    GENERATED,
    '',
    INTRO[audience],
    '',
    `${plural(total, 'endpoint')} in ${plural(pages.length, 'group')}.`,
    '',
    ...pages.flatMap((page) => {
      const operations = [...(groups.get(page.group) ?? [])].sort(
        (a, b) =>
          (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) ||
          METHODS.indexOf(a.method as never) - METHODS.indexOf(b.method as never)
      );
      return [
        `## ${mdxText(page.group)}`,
        '',
        '| Method | Path | Summary |',
        '| --- | --- | --- |',
        ...operations.map(({ path, method, operation }) => {
          const summary = linkText(operation.summary ?? `${method.toUpperCase()} ${path}`);
          return `| ${code(method.toUpperCase())} | ${code(path)} | [${summary}](/docs/api-reference/${page.slug}#${page.anchors.get(operation.operationId)}) |`;
        }),
        '',
      ];
    }),
    SOURCE,
    '',
  ].join('\n');
}

/**
 * The reference pages, from the OpenAPI document: for each audience (the project API first, then
 * the admin API) an overview and one page per Swagger group. Pure and deterministic: the same
 * document gives the same pages whatever order its keys are in, so a diff means the API changed.
 */
export function generateApiPages(spec: OpenApiSpec): ApiPage[] {
  const buckets = new Map<Audience, Map<string, Placed[]>>();

  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation) continue;
      const audience = audienceOf(path, operation);
      // A controller's tag comes first and one set on the method after it: the last is the specific one.
      const group = operation.tags?.at(-1) ?? 'Other';
      const groups = buckets.get(audience) ?? new Map<string, Placed[]>();
      groups.set(group, [...(groups.get(group) ?? []), { path, method, operation }]);
      buckets.set(audience, groups);
    }
  }

  return AUDIENCES.flatMap((audience) => {
    const groups = buckets.get(audience);
    if (!groups) return [];
    const pages = [...groups.entries()]
      .sort(byName(([group]) => group))
      .map(([group, operations]) => groupPage(audience, group, operations, spec));
    const overviewSlug = `${audience}/overview`;
    const overviewTitle = `${AUDIENCE_TITLE[audience]} overview`;
    const overviewDescription = pageDescription(
      overviewSlug,
      AUDIENCE_DESCRIPTION[audience],
      AUDIENCE_TITLE[audience]
    );
    return [
      {
        audience,
        group: 'Overview',
        slug: overviewSlug,
        title: overviewTitle,
        description: overviewDescription,
        content:
          frontmatter(overviewTitle, overviewDescription) + overviewPage(audience, pages, groups),
      },
      ...pages.map((page) => {
        const description = pageDescription(page.slug, page.tagDescription, page.group);
        return {
          audience,
          group: page.group,
          slug: page.slug,
          title: page.group,
          description,
          content: frontmatter(page.group, description) + page.content,
        };
      }),
    ];
  });
}

const count = (items: ApiPage[]) =>
  items
    .filter((page) => page.group !== 'Overview')
    .map((page) => (page.content.match(/<Endpoint /g) ?? []).length)
    .reduce((a, b) => a + b, 0);

/** The landing page of the reference at `/docs/api-reference`: one section per audience. */
function referenceIndex(pages: ApiPage[]): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const head = frontmatter(
    'API reference',
    'Every endpoint of the MCID HTTP API, generated from its OpenAPI document: the project API and the admin API.'
  );
  return (
    head +
    [
      GENERATED,
      '',
      'Every endpoint of the MCID HTTP API, generated from the OpenAPI document the API publishes. The reference has two parts, by who calls the endpoints.',
      '',
      ...AUDIENCES.flatMap((audience) => {
        const own = pages.filter((page) => page.audience === audience);
        if (own.length === 0) return [];
        const groups = own.filter((page) => page.group !== 'Overview').length;
        return [
          `## ${AUDIENCE_TITLE[audience]}`,
          '',
          AUDIENCE_DESCRIPTION[audience],
          '',
          `${plural(count(own), 'endpoint')} in ${plural(groups, 'group')}. Start with the [${AUDIENCE_TITLE[audience]} overview](/docs/api-reference/${audience}/overview).`,
          '',
        ];
      }),
      SOURCE,
      '',
    ].join('\n')
  );
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Every file of `src/content/docs/api-reference`: the pages, the reference's index page, and the
 * Fumadocs `meta.json` of each folder, which orders the sidebar (overview first, then the groups
 * by name) and names the folders.
 */
export function generateApiReference(spec: OpenApiSpec): ApiFile[] {
  const pages = generateApiPages(spec);
  const audiences = AUDIENCES.filter((audience) =>
    pages.some((page) => page.audience === audience)
  );
  return [
    { path: 'index.mdx', content: referenceIndex(pages) },
    {
      path: 'meta.json',
      content: json({
        title: 'API reference',
        description: 'Every endpoint of the MCID HTTP API, generated from apps/api/openapi.json.',
        pages: audiences,
      }),
    },
    ...audiences.map((audience) => ({
      path: `${audience}/meta.json`,
      content: json({
        title: AUDIENCE_TITLE[audience],
        description: AUDIENCE_DESCRIPTION[audience],
        pages: pages
          .filter((page) => page.audience === audience)
          .map((page) => page.slug.slice(audience.length + 1)),
      }),
    })),
    ...pages.map((page) => ({ path: `${page.slug}.mdx`, content: page.content })),
  ];
}
