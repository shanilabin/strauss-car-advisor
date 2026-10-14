"use client";

import { Moon, Sun } from "lucide-react";

import { currentTheme, saveTheme } from "@/lib/theme";

/** Icon and label follow the `.dark` class through CSS, so server and client markup match. */
export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={() => saveTheme(currentTheme() === "dark" ? "light" : "dark")}
      className="inline-flex size-11 items-center justify-center border border-nav-border text-nav-foreground transition-colors hover:bg-nav-hover"
    >
      <Moon aria-hidden className="size-5 dark:hidden" />
      <Sun aria-hidden className="hidden size-5 dark:block" />
      <span className="sr-only dark:hidden">מעבר למצב כהה</span>
      <span className="sr-only hidden dark:inline">מעבר למצב בהיר</span>
    </button>
  );
}
