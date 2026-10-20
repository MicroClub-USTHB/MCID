'use client';

import * as React from 'react';
import { format, isValid, parse } from 'date-fns';
import { X } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { McButton } from '@/shared/components/ui/mc-button';
import { McDatePicker } from '@/shared/components/ui/mc-calendar';

const VALUE_FORMAT = 'yyyy-MM-dd';
const FIRST_YEAR = 2015;

/** Reads a `yyyy-MM-dd` value as that calendar day, ignoring the time zone. */
function parseDateValue(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = parse(value, VALUE_FORMAT, new Date());
  return isValid(date) ? date : undefined;
}

function formatDateValue(date: Date): string {
  return format(date, VALUE_FORMAT);
}

interface DateFieldProps {
  label: string;
  /** The day as `yyyy-MM-dd`, the format the API filters take. Empty means no date. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
}

/**
 * A labelled mcoli-ui date picker that reads and writes the `yyyy-MM-dd`
 * strings the filters send, with a button to clear the day.
 */
function DateField({
  label,
  value,
  onChange,
  id,
  placeholder = 'Any date',
  className,
  triggerClassName,
}: DateFieldProps) {
  const selected = parseDateValue(value);
  const endMonth = React.useMemo(() => new Date(new Date().getFullYear() + 1, 11), []);

  return (
    <div className={cn('flex items-end gap-1', className)}>
      <McDatePicker
        id={id}
        label={label}
        placeholder={placeholder}
        dateFormat="MMM d, yyyy"
        selected={selected}
        onSelect={(date) => onChange(date ? formatDateValue(date) : undefined)}
        startMonth={new Date(FIRST_YEAR, 0)}
        endMonth={endMonth}
        className="min-w-0 flex-1"
        triggerClassName={cn('w-full min-w-40', triggerClassName)}
      />
      {selected ? (
        <McButton
          type="button"
          variant="tertiary"
          size="sm"
          icon="only"
          iconDefinition={<X aria-hidden="true" />}
          onClick={() => onChange(undefined)}
        >
          {`Clear ${label}`}
        </McButton>
      ) : null}
    </div>
  );
}

export { DateField, formatDateValue, parseDateValue, type DateFieldProps };
