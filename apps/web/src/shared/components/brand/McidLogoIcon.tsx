import { cn } from '@/shared/lib/utils';
import { MCID_MARK } from './mcid-mark';

interface McidLogoIconProps {
  className?: string;
  size?: number;
  /** Accessible name; omit when the mark sits next to visible text that names it. */
  title?: string;
}

/** The MCID fingerprint mark in the current theme's foreground and primary colours. */
export function McidLogoIcon({ className, size = 32, title }: McidLogoIconProps) {
  const stroke = {
    strokeWidth: MCID_MARK.strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={MCID_MARK.viewBox}
      width={size}
      height={size}
      fill="none"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn('shrink-0 transition-colors duration-300', className)}
    >
      <path d={MCID_MARK.outer} stroke="var(--foreground)" {...stroke} />
      <path d={MCID_MARK.middle} stroke="var(--primary)" {...stroke} />
      <path d={MCID_MARK.core} stroke="var(--foreground)" {...stroke} />
    </svg>
  );
}
