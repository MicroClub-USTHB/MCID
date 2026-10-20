'use client';

import * as React from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { McButton } from '@/shared/components/ui/mc-button';
import { McTooltip, McTooltipContent, McTooltipTrigger } from '@/shared/components/ui/mc-tooltip';

/** An icon button inside the field, named by `label` and with that label as its tooltip. */
function IconAction({
  label,
  icon,
  onClick,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <McTooltip>
      <McTooltipTrigger
        render={
          <McButton
            type="button"
            variant="tertiary"
            size="sm"
            icon="only"
            iconDefinition={icon}
            onClick={onClick}
            className={cn(
              'size-8 bg-transparent p-0 text-muted-foreground hover:bg-secondary hover:text-secondary-foreground',
              className
            )}
          >
            {label}
          </McButton>
        }
      />
      <McTooltipContent side="top" sideOffset={8} arrow={false} className="p-2">
        {label}
      </McTooltipContent>
    </McTooltip>
  );
}

interface MaskedInputProps extends Omit<React.ComponentProps<'input'>, 'value' | 'onCopy'> {
  value: string;
  /** Masks the displayed value behind `maskChar` until the reveal toggle is pressed. */
  secret?: boolean;
  maskChar?: string;
  copyLabel?: string;
  revealLabel?: string;
  /** Called after a successful copy; used to drive e.g. a toast. */
  onCopy?: () => void;
  showRevealToggle?: boolean;
}

/**
 * Read-only, copyable code field for secrets, styled like the mcoli-ui input.
 * A `secret` value renders as a repeated mask character until the eye toggle
 * shows it. Copy uses the async Clipboard API and flips to a temporary check.
 */
function MaskedInput({
  value,
  secret = false,
  maskChar = '•',
  copyLabel,
  revealLabel,
  onCopy,
  showRevealToggle = true,
  className,
  ...props
}: MaskedInputProps) {
  const [visible, setVisible] = React.useState(!secret);
  const [copied, setCopied] = React.useState(false);
  const copyTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  React.useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const displayed = value || (secret ? maskChar.repeat(12) : '');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
      onCopy?.();
    } catch {
      // Clipboard access can be denied (permissions / non-HTTPS); the field
      // stays selectable so the fallback is a manual copy.
    }
  }

  return (
    <div className={cn('relative', className)}>
      <input
        readOnly
        data-slot="masked-input"
        value={secret && !visible ? maskChar.repeat(displayed.length || 12) : displayed}
        onFocus={(event) => event.currentTarget.select()}
        className="h-11 w-full min-w-0 rounded-lg border border-border bg-input pr-20 pl-3.5 font-mono text-sm text-foreground shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring"
        {...props}
      />
      <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-1.5">
        {showRevealToggle && secret && (
          <IconAction
            label={revealLabel ?? (visible ? 'Hide value' : 'Reveal value')}
            onClick={() => setVisible((v) => !v)}
            icon={visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          />
        )}
        <IconAction
          label={copyLabel ?? 'Copy to clipboard'}
          onClick={() => void handleCopy()}
          className={copied ? 'text-success hover:text-success' : undefined}
          icon={copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        />
      </div>
    </div>
  );
}

export { MaskedInput, type MaskedInputProps };
