import Link from 'next/link';
import type * as PageTree from 'fumadocs-core/page-tree';
import { ArrowRight } from 'lucide-react';

import { groupRuns, treeSections } from '@/features/docs/page-tree';

const idOf = (name: string) => `section-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/** The docs home: a card per top-level folder, with a link to every page in it. */
export function DocsSections({ tree }: { tree: PageTree.Root }) {
  return (
    <div className="not-prose mt-8 grid gap-4 md:grid-cols-2">
      {treeSections(tree).map((section) => (
        <section
          key={section.name}
          aria-labelledby={idOf(section.name)}
          className="flex flex-col rounded-xl border border-border bg-card/60 p-5 transition-colors hover:border-primary/40"
        >
          <h2
            id={idOf(section.name)}
            className="font-heading text-lg font-bold tracking-[-0.02em] text-foreground"
          >
            {section.name}
          </h2>
          {section.description ? (
            <p className="mt-1 paragraph-sm text-muted-foreground">{section.description}</p>
          ) : null}
          {groupRuns(section.pages).map((run) => (
            <div key={run.pages[0]!.url} className="mt-4">
              {run.group ? (
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {run.group}
                </h3>
              ) : null}
              <ul className="flex flex-col gap-1">
                {run.pages.map((page) => (
                  <li key={page.url}>
                    <Link
                      href={page.url}
                      className="group inline-flex items-center gap-1.5 rounded-sm paragraph-sm text-primary underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {page.name}
                      <ArrowRight
                        className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
