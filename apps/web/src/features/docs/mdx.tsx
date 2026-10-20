import type { MDXComponents } from 'mdx/types';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Tab, Tabs, TabsContent, TabsList, TabsTrigger } from 'fumadocs-ui/components/tabs';

import { Callout } from '@/features/docs/components/callout';
import { Diagram } from '@/features/docs/components/diagram';
import { DocLink } from '@/features/docs/components/doc-link';
import { DocsSections } from '@/features/docs/components/docs-sections';
import { DocTable } from '@/features/docs/components/doc-table';
import { Endpoint } from '@/features/docs/components/endpoint';
import { InboundContract } from '@/features/docs/components/inbound-contract';
import { Steps } from '@/features/docs/components/steps';
import { SwaggerLink } from '@/features/docs/components/swagger-link';
import { source } from '@/features/docs/source';

/**
 * What the docs MDX renders with: the Fumadocs defaults (headings with anchors, code blocks with
 * highlighting and a copy button, cards) plus the components the content uses by name.
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    a: DocLink,
    table: DocTable,
    Callout,
    Steps,
    Diagram,
    Endpoint,
    SwaggerLink,
    InboundContract,
    Tabs,
    Tab,
    TabsList,
    TabsTrigger,
    TabsContent,
    DocsSections: () => <DocsSections tree={source.pageTree} />,
    ...components,
  };
}
