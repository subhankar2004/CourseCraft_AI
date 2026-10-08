// Shared by the server root layout (inline script) and the client theme store.
// No 'use client' here: Server Components must import the real string, not a client reference.

export const THEME_STORAGE_KEY = 'theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Applies the saved theme before first paint (inlined in <head> by the root layout, per the
 * Next.js "Preventing flash before hydration" guide). Must stay dependency-free and tolerate
 * blocked storage. shadcn/ui styles key off the `dark` class on <html>.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("${DARK_QUERY}").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;
