import type { ReactNode } from 'react';

/**
 * Turns the numbered list inside into a procedure, drawn like the Fumadocs steps: a rail on the
 * left and a numbered marker in the brand primary on each item (see `.docs-steps` in docs.css).
 */
export function Steps({ children }: { children: ReactNode }) {
  return <div className="docs-steps">{children}</div>;
}
