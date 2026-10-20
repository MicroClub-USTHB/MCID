import { LANDING } from '@/features/landing/content';
import { CopyButton } from '@/features/landing/components/primitives';
import { cn } from '@/shared/lib/utils';

const { command } = LANDING;
export const LANDING_COMMAND = `${command.bin} ${command.args} ${command.flag}`;

export function CommandLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-2xl border border-border bg-card/80 text-left shadow-xl backdrop-blur-xl',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="font-mono text-xs text-muted-foreground">{command.label}</span>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <code className="min-w-0 truncate font-mono text-sm">
          <span className="text-muted-foreground select-none">$ </span>
          <span className="text-foreground">{command.bin} </span>
          <span className="text-muted-foreground">{command.args} </span>
          <span className="font-semibold text-primary">{command.flag}</span>
        </code>
        <CopyButton value={LANDING_COMMAND} />
      </div>
    </div>
  );
}
