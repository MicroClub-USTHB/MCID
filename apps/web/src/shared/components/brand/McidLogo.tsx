import { cn } from '@/shared/lib/utils';
import { McidLogoIcon } from './McidLogoIcon';

interface McidLogoProps {
  className?: string;
  /** Height of the mark in px; the wordmark scales with it. */
  height?: number;
}

/**
 * Mark + wordmark, built like the mcoli-ui logo: "MC" in the foreground colour and "ID" in
 * the primary colour, set in Plus Jakarta Sans. The accessible name is "MCID".
 */
export function McidLogo({ className, height = 28 }: McidLogoProps) {
  return (
    <span
      role="img"
      aria-label="MCID"
      className={cn('inline-flex shrink-0 items-center', className)}
      style={{ gap: height * 0.3 }}
    >
      <McidLogoIcon size={height} />
      <span
        aria-hidden="true"
        className="font-heading leading-none font-extrabold tracking-[-0.02em]"
        style={{ fontSize: height * 0.72 }}
      >
        <span className="text-foreground">MC</span>
        <span className="text-primary">ID</span>
      </span>
    </span>
  );
}
