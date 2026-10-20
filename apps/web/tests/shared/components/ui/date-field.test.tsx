import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { DateField, formatDateValue, parseDateValue } from '@/shared/components/ui/date-field';

import { getDateTrigger, pickDate } from '../../../helpers/date-picker';

function Harness({ initial, onChange }: { initial?: string; onChange: (v?: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <DateField
      label="From"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('DateField', () => {
  it('shows the placeholder until a day is picked, then the day', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    expect(getDateTrigger('From')).toHaveTextContent('Any date');

    await pickDate(user, 'From', '2026-04-01');

    expect(onChange).toHaveBeenLastCalledWith('2026-04-01');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(getDateTrigger('From')).toHaveTextContent('Apr 1, 2026');
  });

  it('clears the day', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial="2026-04-30" onChange={onChange} />);

    expect(getDateTrigger('From')).toHaveTextContent('Apr 30, 2026');
    await user.click(screen.getByRole('button', { name: 'Clear From' }));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
    expect(getDateTrigger('From')).toHaveTextContent('Any date');
    expect(screen.queryByRole('button', { name: 'Clear From' })).toBeNull();
  });

  it('reads and writes calendar days without a time zone shift', () => {
    const date = parseDateValue('2026-12-31');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(11);
    expect(date?.getDate()).toBe(31);
    expect(formatDateValue(date!)).toBe('2026-12-31');
    expect(parseDateValue('not a date')).toBeUndefined();
    expect(parseDateValue(undefined)).toBeUndefined();
  });
});
