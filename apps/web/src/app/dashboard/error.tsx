'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

import { McButton } from '@/shared/components/ui/mc-button';

/**
 * Catches render errors in any dashboard page, so one broken component shows
 * this panel inside the shell instead of taking the whole app down.
 */
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="relative isolate flex flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-dots opacity-60 mask-radial"
      />
      <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-error/10 text-error shadow-sm">
        <AlertCircle className="size-6" aria-hidden="true" />
      </div>
      <h1 className="header-xs font-bold tracking-tight text-foreground">
        This page ran into a problem
      </h1>
      <p className="max-w-md paragraph-sm text-muted-foreground">
        Something on this page failed to display. Try again, or open another section from the
        sidebar.
      </p>
      <McButton variant="secondary" onClick={() => unstable_retry()}>
        Try again
      </McButton>
    </div>
  );
}
