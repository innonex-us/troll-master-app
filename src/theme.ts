// Theme is a local cosmetic preference — stored in localStorage only (instant, no
// flash-of-wrong-theme), deliberately NOT part of AppSettings/JSON backup.
//
// "system" removes the data-theme attribute so the @media (prefers-color-scheme)
// rule in App.css wins; "light"/"dark" force it via :root[data-theme="…"].

export type Theme = "system" | "light" | "dark";

const KEY = "theme";

export function getTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}
