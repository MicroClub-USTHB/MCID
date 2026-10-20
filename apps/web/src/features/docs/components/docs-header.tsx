'use client';

import type * as React from 'react';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { useNotebookLayout } from 'fumadocs-ui/layouts/notebook';
import { PanelLeft, Search } from 'lucide-react';

import { SiteHeader } from '@/shared/components/site';
import { cn } from '@/shared/lib/utils';

const iconButton =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Opens the Fumadocs search dialog: a wide field with the hot key on desktop, an icon on mobile. */
export function SearchButton() {
  const { enabled, hotKey, setOpenSearch } = useSearchContext();
  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        data-search-full=""
        onClick={() => setOpenSearch(true)}
        className="group hidden h-9 w-56 items-center gap-2 rounded-lg border border-border bg-muted/40 ps-3 pe-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex lg:w-64"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-start">Search docs...</span>
        <span className="flex gap-0.5" aria-hidden="true">
          {hotKey.map((key, index) => (
            <kbd
              key={index}
              className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-background px-1 font-mono text-[11px] text-muted-foreground"
            >
              {key.display}
            </kbd>
          ))}
        </span>
      </button>
      <button
        type="button"
        data-search=""
        aria-label="Search docs"
        onClick={() => setOpenSearch(true)}
        className={cn(iconButton, 'md:hidden')}
      >
        <Search className="size-4.5" aria-hidden="true" />
      </button>
    </>
  );
}

/**
 * Notebook `slots.header`: the same SiteHeader as the landing page, across the whole first grid
 * row, with the docs search and, on mobile, the trigger of the Fumadocs sidebar drawer.
 */
export function DocsHeader({ className, ...props }: React.ComponentProps<'header'>) {
  const { slots } = useNotebookLayout();
  const Trigger = slots.sidebar?.trigger;

  return (
    <SiteHeader
      {...props}
      contentClassName="max-w-[97rem]"
      // Spans every grid column; inline-size containment keeps its content width from
      // inflating the layout's min-content side columns.
      className={cn(
        'col-[1/-1] row-start-1 top-(--fd-docs-row-1) z-30 [contain:inline-size]',
        className
      )}
      search={<SearchButton />}
      mobileTrigger={
        Trigger ? (
          <Trigger aria-label="Open navigation" className={cn(iconButton, 'md:hidden')}>
            <PanelLeft className="size-4.5" aria-hidden="true" />
          </Trigger>
        ) : null
      }
    />
  );
}
