'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

import { useThemeMode } from '@/shared/lib/theme';
import { cn } from '@/shared/lib/utils';

const subscribe = () => () => {};

/** The light/dark switch of the mcoli-ui site: a sliding thumb with a sun or a moon. */
export function ModeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useThemeMode();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  // The stored mode is unknown on the server; keep the slot to avoid a layout shift.
  if (!mounted) {
    return (
      <div aria-hidden="true" className={cn('h-7 w-12 rounded-full bg-muted/50', className)} />
    );
  }

  const isDark = mode === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      onClick={() => setMode(isDark ? 'light' : 'dark')}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        isDark ? 'bg-primary' : 'bg-muted',
        className
      )}
    >
      <span className="sr-only">Dark mode</span>
      <span
        className={cn(
          'pointer-events-none relative inline-block size-6 rounded-full bg-background shadow ring-0 transition-transform duration-300 ease-in-out',
          isDark ? 'translate-x-5' : 'translate-x-0'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-opacity ease-in-out',
            isDark ? 'opacity-0 duration-100' : 'opacity-100 duration-200'
          )}
        >
          <Sun className="size-3.5 text-muted-foreground" />
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-opacity ease-in-out',
            isDark ? 'opacity-100 duration-200' : 'opacity-0 duration-100'
          )}
        >
          <Moon className="size-3.5 text-primary" />
        </span>
      </span>
    </button>
  );
}
