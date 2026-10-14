export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "strauss-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The saved choice, or null when the user never picked one (then the OS setting wins). */
export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked (private mode); the theme still applies for this page view.
  }
  applyTheme(theme);
}

export function watchSystemTheme(onChange: (theme: Theme) => void) {
  const query = window.matchMedia(DARK_QUERY);
  const listener = () => onChange(query.matches ? "dark" : "light");
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/** Runs in <head> during HTML parsing, before first paint, so there is no light/dark flash. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var d=t==="dark"||(t!=="light"&&window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
