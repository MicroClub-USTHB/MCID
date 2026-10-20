import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { McButton } from '@/shared/components/ui/mc-button';

interface EmptyStateProps extends React.ComponentProps<'div'> {
  /** A Lucide icon component (`icon={Users}`) or an already-rendered node (`icon={<Users className="size-6" />}`). */
  icon?: LucideIcon | React.ReactNode;
  title: string;
  description?: string;
  /** Custom action node. Takes precedence over `actionLabel`/`onAction`. */
  action?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

/** Placeholder for a list or panel with nothing to show yet, on the mcoli-ui tokens. */
function EmptyState({
  icon,
  title,
  description,
  action,
  actionLabel,
  onAction,
  className,
  ...props
}: EmptyStateProps) {
  const iconNode = icon
    ? React.isValidElement(icon)
      ? icon
      : React.createElement(icon as React.ElementType, {
          className: 'size-6',
          'aria-hidden': true,
        })
    : null;

  return (
    <div
      data-slot="empty-state"
      className={cn(
        'relative isolate flex flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center',
        className
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-dots opacity-60 mask-radial"
      />
      {iconNode && (
        <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-secondary text-secondary-foreground shadow-sm">
          {iconNode}
        </div>
      )}
      <div className="flex flex-col items-center gap-1.5">
        <p className="font-heading paragraph-lg font-bold text-foreground">{title}</p>
        {description && (
          <p className="max-w-md paragraph-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action ??
        (actionLabel && onAction ? (
          <McButton variant="secondary" size="sm" onClick={onAction}>
            {actionLabel}
          </McButton>
        ) : null)}
    </div>
  );
}

export { EmptyState, type EmptyStateProps };
