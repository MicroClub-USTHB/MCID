'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

export type ThemeMode = 'light' | 'dark';

/** localStorage key holding the member's choice. */
export const THEME_STORAGE_KEY = 'mcid-theme';

/** Micro Club's brand theme is Primary in dark mode, so a first visit is dark. */
export const DEFAULT_THEME: ThemeMode = 'dark';

const CHANGE_EVENT = 'mcid-theme-change';

/**
 * Runs in <head> before the page paints (see `app/layout.tsx`), so the right palette shows on
 * the first frame. Kept free of imports: it is serialised into an inline script.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t?t==='dark':${DEFAULT_THEME === 'dark'};var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

function readTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.style.colorScheme = mode;
}

/**
 * Runs a DOM change inside a View Transition so a light/dark swap crossfades, as on the
 * mcoli-ui site. Falls back to an instant change when unsupported or with reduced motion.
 */
export function withViewTransition(update: () => void) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduceMotion) {
    update();
    return;
  }
  const transition = document.startViewTransition(() => flushSync(update));
  transition.ready.catch(() => {});
  transition.finished.catch(() => {});
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** The current light/dark mode and a setter that stores it and repaints with a crossfade. */
export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  // The stored choice is only known in the browser; the server renders the default.
  const mode = useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);

  const setMode = useCallback((next: ThemeMode) => {
    withViewTransition(() => {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Storage can be unavailable (private mode); the choice still applies to this page.
      }
      applyTheme(next);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    });
  }, []);

  return [mode, setMode];
}
