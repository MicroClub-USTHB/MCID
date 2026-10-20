import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';

import { CopyButton, Reveal, SectionHeader } from '@/features/landing/components/primitives';
import { LANDING } from '@/features/landing/content';

const { developers } = LANDING;
const REQUEST = developers.request.join('\n');

function CodeBlock({ label, lines }: { label: string; lines: readonly string[] }) {
  return (
    <div>
      <p className="px-4 pt-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <pre className="overflow-x-auto px-4 pb-4 font-mono text-[12px] leading-6 text-foreground">
        <code>
          {lines.map((line, i) => (
            <span key={i} className="block">
              {line}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

export function Developers() {
  return (
    <section
      id="developers"
      aria-labelledby="developers-title"
      className="landing-deferred relative py-20 md:py-24"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 md:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div className="flex flex-col gap-8">
          <SectionHeader
            id="developers-title"
            align="start"
            eyebrow={developers.eyebrow}
            title={developers.title}
            description={developers.description}
          />
          <Reveal delay={100} className="flex flex-col gap-6">
            <ul className="flex flex-col gap-3">
              {developers.points.map((point) => (
                <li key={point} className="flex items-start gap-3 paragraph-sm text-foreground">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                    <Check className="size-3" aria-hidden="true" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <Link
              href={developers.link.href}
              className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {developers.link.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Reveal>
        </div>

        <Reveal delay={150} className="relative min-w-0">
          <div
            aria-hidden="true"
            className="absolute inset-x-8 -top-4 bottom-8 -z-10 rounded-[2rem] bg-primary/15 blur-3xl"
          />
          <figure className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-border" />
                <span className="size-2.5 rounded-full bg-border" />
                <span className="size-2.5 rounded-full bg-border" />
              </span>
              <figcaption className="ms-2 rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground">
                {developers.file}
              </figcaption>
              <CopyButton value={REQUEST} label="Copy request" className="ms-auto size-7" />
            </div>
            <CodeBlock label="Request" lines={developers.request} />
            <div className="border-t border-border bg-muted/30">
              <CodeBlock label="Response 200" lines={developers.response} />
            </div>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
