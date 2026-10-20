'use client';

import * as React from 'react';
import { OTPInput, OTPInputContext } from 'input-otp';

import { cn } from '@/shared/lib/utils';
import { MinusIcon } from 'lucide-react';

function McInputOtp({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string;
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn('flex items-center has-disabled:opacity-50', containerClassName)}
      spellCheck={false}
      className={cn('disabled:cursor-not-allowed', className)}
      {...props}
    />
  );
}

function McInputOtpGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="input-otp-group" className={cn('flex items-center', className)} {...props} />
  );
}

function McInputOtpSlot({
  index,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  index: number;
}) {
  const inputOTPContext = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {};

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        'relative flex size-10 items-center justify-center border border-border bg-input text-sm transition-all outline-none first:rounded-l-md last:rounded-r-md last:mr-0 not-last:-mr-px data-[active=true]:z-10 data-[active=true]:border-transparent data-[active=true]:ring-2 data-[active=true]:ring-border',
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  );
}

function McInputOtpSeparator({ ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-otp-separator"
      className="flex items-center mx-2"
      role="separator"
      {...props}
    >
      <MinusIcon size={24} strokeWidth={1.25} className="text-muted-foreground" />
    </div>
  );
}

export { McInputOtp, McInputOtpGroup, McInputOtpSlot, McInputOtpSeparator };
