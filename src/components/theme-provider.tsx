"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Theme is owned entirely by next-themes: class strategy, system preference by
 * default, persisted across reloads.
 *
 * Per the build rules, this is the ONLY thing allowed to persist to
 * localStorage — next-themes does it internally to avoid a flash of the wrong
 * theme on load. No app state may follow it there.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    /**
     * `disableTransitionOnChange` is deliberately NOT set.
     *
     * The preview fades the theme over 250ms (`body { transition: background
     * .25s, color .25s }`) and that fade is the intended design. The flag exists
     * to suppress exactly that, so enabling it would contradict the design
     * source of truth.
     *
     * If some future surface animates badly on a theme flip, give that element
     * `transition-none` rather than reintroducing the flag and freezing the
     * body fade along with it.
     */
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
