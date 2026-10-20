import type { ReactNode } from 'react';
import { Callout as FumadocsCallout } from 'fumadocs-ui/components/callout';

const TYPES = {
  note: { label: 'Note', type: 'info' },
  tip: { label: 'Tip', type: 'success' },
  warning: { label: 'Warning', type: 'warning' },
} as const;

interface CalloutProps {
  type?: keyof typeof TYPES;
  children: ReactNode;
}

/**
 * The Fumadocs callout, with the content's three kinds. The title says what kind it is, so
 * colour is never the only cue.
 */
export function Callout({ type = 'note', children }: CalloutProps) {
  const { label, type: kind } = TYPES[type];

  return (
    <FumadocsCallout role="note" type={kind} title={label} className="docs-callout">
      {children}
    </FumadocsCallout>
  );
}
