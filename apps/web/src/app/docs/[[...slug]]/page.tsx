import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/layouts/notebook/page';

import { getMDXComponents } from '@/features/docs/mdx';
import { sectionOf } from '@/features/docs/page-tree';
import { source } from '@/features/docs/source';

/** Only the pages of the collection exist; anything else is a 404 without trying to render it. */
export const dynamicParams = false;

interface DocsPageProps {
  params: Promise<{ slug?: string[] }>;
}

export default async function Page({ params }: DocsPageProps) {
  const page = source.getPage((await params).slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage
      toc={page.data.toc}
      tableOfContent={{ style: 'clerk' }}
      tableOfContentPopover={{ style: 'clerk' }}
      breadcrumb={{ className: 'docs-eyebrow' }}
    >
      <DocsTitle className="font-heading text-3xl font-extrabold tracking-[-0.02em] text-balance md:header-md">
        {page.data.title}
      </DocsTitle>
      <DocsDescription className="paragraph-lg text-pretty text-fd-muted-foreground">
        {page.data.description}
      </DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </DocsPage>
  );
}

/** Prerender every docs page at build time. */
export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const page = source.getPage((await params).slug);
  if (!page) notFound();

  const section = sectionOf(source.pageTree, page.url);
  const title = section ? `${page.data.title} | ${section}` : page.data.title;
  return {
    title,
    description: page.data.description,
    alternates: { canonical: page.url },
    openGraph: { type: 'article', url: page.url, title, description: page.data.description },
  };
}
