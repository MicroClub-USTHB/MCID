/**
 * Turns `apps/api/openapi.json` into one MDX page per Swagger group under
 * `src/content/docs/api-reference`, plus the reference's index page and the Fumadocs `meta.json`
 * files that order its sidebar. Run with `pnpm docs:api` from the repository root (which
 * exports the spec first) or `pnpm --filter @mcid/web run docs:api` to use the committed spec.
 */
import fs from 'node:fs';
import path from 'node:path';

import { generateApiReference } from '../src/features/docs/api-reference/generate';
import type { OpenApiSpec } from '../src/features/docs/api-reference/types';

const spec = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../api/openapi.json'), 'utf8')
) as OpenApiSpec;
const outDir = path.resolve(__dirname, '../src/content/docs/api-reference');

const files = generateApiReference(spec);

for (const page of files) {
  const file = path.join(outDir, page.path);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, page.content);
}

// A file that is no longer generated (a group moved or removed) must not stay behind.
const wanted = new Set(files.map((page) => path.join(outDir, page.path)));

function removeStale(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeStale(full);
      if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
    } else if (/\.(mdx|json)$/.test(entry.name) && !wanted.has(full)) {
      fs.rmSync(full);
      console.log(`removed ${path.relative(outDir, full)}`);
    }
  }
}
removeStale(outDir);

console.log(`api-reference: ${files.length} files written`);
