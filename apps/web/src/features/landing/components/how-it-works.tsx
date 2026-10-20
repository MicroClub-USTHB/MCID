import { Reveal, SectionHeader } from '@/features/landing/components/primitives';
import { LANDING } from '@/features/landing/content';

const { howItWorks } = LANDING;

const SNIPPETS = [
  'GET /auth/sso/authorize?client_id=…&state=…',
  'mcid_sso cookie set · next login skips Discord',
  'POST /auth/token → { token, member, roles }',
] as const;

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-title"
      className="landing-deferred relative py-20 md:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionHeader
          id="how-it-works-title"
          eyebrow={howItWorks.eyebrow}
          title={howItWorks.title}
          description={howItWorks.description}
        />

        <ol className="relative mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          <span
            aria-hidden="true"
            className="absolute top-9 right-[16%] left-[16%] hidden h-px bg-linear-to-r from-transparent via-border to-transparent md:block"
          />
          {howItWorks.steps.map((step, i) => (
            <li key={step.title} className="relative">
              <Reveal
                delay={i * 100}
                className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 items-center justify-center rounded-lg border border-primary bg-primary font-mono text-sm font-semibold text-primary-foreground"
                >
                  {i + 1}
                </span>
                <div className="space-y-1.5">
                  <h3 className="font-heading text-lg font-bold text-card-foreground">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="paragraph-sm text-pretty text-muted-foreground">
                    {step.description}
                  </p>
                </div>
                <code className="mt-auto block truncate rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-[12px] text-foreground">
                  {SNIPPETS[i]}
                </code>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
