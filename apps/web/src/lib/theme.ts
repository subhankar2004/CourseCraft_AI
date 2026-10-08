'use client';

import { useSyncExternalStore } from 'react';

import { DARK_QUERY, THEME_STORAGE_KEY } from './theme-script';

/**
 * Minimal light/dark/system theme store. The initial theme is applied before first paint by
 * THEME_INIT_SCRIPT (see theme-script.ts); this keeps React in sync with the DOM afterwards.
 */
export type Theme = 'light' | 'dark' | 'system';

const THEME_EVENT = 'coursecraft:theme';

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia(DARK_QUERY).matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode): still apply for this page view.
  }
  applyTheme(theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const media = matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    if (readTheme() === 'system') applyTheme('system');
    onChange();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener('storage', onSystemChange); // other tabs
  media.addEventListener('change', onSystemChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener('storage', onSystemChange);
    media.removeEventListener('change', onSystemChange);
  };
}

/** The user's chosen theme ('system' during SSR). */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => 'system');
}
