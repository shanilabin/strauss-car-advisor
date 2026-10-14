"use client";

import { useLayoutEffect } from "react";

import { applyTheme, storedTheme, systemTheme, watchSystemTheme } from "@/lib/theme";

/**
 * Keeps <html class="dark"> in line with the saved choice or the OS setting.
 * The inline script handles first paint; this re-applies after React resets <html>
 * (dev Strict Mode remount) and follows OS changes until the user picks a theme.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme(storedTheme() ?? systemTheme());
    return watchSystemTheme((theme) => {
      if (storedTheme() === null) applyTheme(theme);
    });
  }, []);

  return null;
}
