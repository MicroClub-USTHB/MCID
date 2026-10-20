import * as React from 'react';

import { cn } from '@/shared/lib/utils';

interface PageHeaderProps extends Omit<React.ComponentProps<'header'>, 'title'> {
  /** Section name shown above the title, like the mcoli-ui section eyebrows ("Discord", "System"). */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons, toggles or badges aligned to the right on wide screens. */
  actions?: React.ReactNode;
  /** Extra lines under the description (badges, metadata). */
  children?: React.ReactNode;
  /** Something shown before the title block, such as an avatar. */
  leading?: React.ReactNode;
  titleClassName?: string;
}

/**
 * The one header every dashboard page uses: a primary eyebrow, a Plus Jakarta
 * title, a muted description and the page actions on the right.
 */
function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  leading,
  className,
  titleClassName,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}
      {...props}
    >
      <div className="flex min-w-0 items-start gap-4">
        {leading}
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow ? (
            <p data-slot="page-header-eyebrow" className="text-sm font-semibold text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h1
            className={cn(
              'header-xs font-bold tracking-tight text-balance break-words text-foreground md:header-sm',
              titleClassName
            )}
          >
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl paragraph-sm text-pretty text-muted-foreground md:paragraph-md">
              {description}
            </p>
          ) : null}
          {children}
        </div>
      </div>
      {actions ? (
        <div data-slot="page-header-actions" className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export { PageHeader, type PageHeaderProps };
