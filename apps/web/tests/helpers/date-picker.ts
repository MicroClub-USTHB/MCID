import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { format, parse } from 'date-fns';

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The trigger of the `DateField` labelled `label` (its name is the label then the value). */
export function getDateTrigger(label: string) {
  return screen.getByRole('button', { name: new RegExp(`^${escape(label)}(\\s|$)`) });
}

/** Opens the `DateField` labelled `label` and picks `value` (`yyyy-MM-dd`) in its calendar. */
export async function pickDate(user: UserEvent, label: string, value: string) {
  const date = parse(value, 'yyyy-MM-dd', new Date());
  await user.click(getDateTrigger(label));

  const dialog = await screen.findByRole('dialog');
  await user.selectOptions(
    within(dialog).getByRole('combobox', { name: /year/i }),
    String(date.getFullYear())
  );
  await user.selectOptions(
    within(dialog).getByRole('combobox', { name: /month/i }),
    String(date.getMonth())
  );
  const day = within(dialog)
    .getAllByRole('button', { name: new RegExp(escape(format(date, 'MMMM do, yyyy'))) })
    .find((button) => !button.closest('[data-outside]'));
  if (!day) throw new Error(`No day button for ${value}`);
  await user.click(day);
}
