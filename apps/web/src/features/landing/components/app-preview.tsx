import Image from 'next/image';

import { LANDING } from '@/features/landing/content';

const shot = LANDING.screenshot;

/** The real admin panel in a browser window, one shot per theme. */
export function AppPreview() {
  return (
    <div className="relative mx-auto w-full max-w-6xl">
      <div
        aria-hidden="true"
        className="absolute inset-x-10 -top-6 bottom-10 -z-10 rounded-[2rem] bg-primary/20 blur-3xl"
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl ring-1 ring-foreground/5">
        <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-3 rounded-full bg-destructive/70" />
            <span className="size-3 rounded-full bg-warning/70" />
            <span className="size-3 rounded-full bg-success/70" />
          </div>
          <div
            aria-hidden="true"
            className="mx-auto flex h-6 w-full max-w-xs min-w-0 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 font-mono text-[11px] text-muted-foreground"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-success" />
            <span className="truncate">{shot.url}</span>
          </div>
          <div className="hidden w-12 sm:block" aria-hidden="true" />
        </div>
        <Image
          src={shot.src}
          width={shot.width}
          height={shot.height}
          alt={shot.alt}
          preload
          sizes="(min-width: 1152px) 1152px, 100vw"
          className="h-auto w-full dark:hidden"
        />
        <Image
          src={shot.srcDark}
          width={shot.width}
          height={shot.height}
          alt={shot.alt}
          sizes="(min-width: 1152px) 1152px, 100vw"
          className="hidden h-auto w-full dark:block"
        />
      </div>
    </div>
  );
}
