'use client';

import type { ThemeSwitchProps } from 'fumadocs-ui/layouts/shared/slots/theme-switch';

import { ModeToggle } from '@/shared/components/common/ModeToggle';

/** Fumadocs' theme switch slot: the app's own light/dark switch, not next-themes. */
export function ThemeControls({ className }: ThemeSwitchProps) {
  return <ModeToggle className={className} />;
}
