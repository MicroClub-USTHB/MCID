'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';

import { cn } from '@/shared/lib/utils';

export function useCopy(timeout = 1600) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = React.useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), timeout);
      } catch {
        // The clipboard can be unavailable (insecure context, denied permission).
      }
    },
    [timeout]
  );

  return { copied, copy };
}

export function CopyButton({
  value,
  label = 'Copy command',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const { copied, copy } = useCopy();

  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      aria-label={copied ? 'Copied' : label}
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className
      )}
    >
      <Copy
        aria-hidden="true"
        className={cn(
          'absolute size-4 transition-all duration-200',
          copied ? 'scale-50 opacity-0' : 'scale-100 opacity-100'
        )}
      />
      <Check
        aria-hidden="true"
        className={cn(
          'absolute size-4 text-success transition-all duration-200',
          copied ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
        )}
      />
    </button>
  );
}

/** Fades children up once they scroll into view. The CSS turns it off under reduced motion. */
export function Reveal({
  className,
  delay = 0,
  children,
  ...props
}: React.ComponentProps<'div'> & { delay?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Without IntersectionObserver (old browsers, jsdom) the content shows at once.
  const [visible, setVisible] = React.useState(
    () => typeof window !== 'undefined' && typeof IntersectionObserver === 'undefined'
  );

  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-visible={visible}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn('landing-reveal', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  id,
  eyebrow,
  title,
  description,
  align = 'center',
  className,
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: 'center' | 'start';
  className?: string;
}) {
  return (
    <Reveal
      className={cn(
        'flex flex-col gap-4',
        align === 'center' ? 'mx-auto max-w-2xl items-center text-center' : 'max-w-xl',
        className
      )}
    >
      <span className="text-sm font-semibold text-primary">{eyebrow}</span>
      <h2 id={id} className="header-sm font-bold text-balance text-foreground md:header-md">
        {title}
      </h2>
      {description ? (
        <p className="paragraph-md text-pretty text-muted-foreground md:paragraph-lg">
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}
