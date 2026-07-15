export type Theme = "dark" | "light";

export async function getSavedTheme(): Promise<Theme> {
  const { theme = "dark" } = await chrome.storage.sync.get("theme");
  return theme as Theme;
}

export function applyTheme(theme: Theme): void {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}
