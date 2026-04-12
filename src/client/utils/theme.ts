import { idbGet } from "./db";
import { THEME_KEY } from "../constants";

const _resolveTheme = (preference: string): string | null => {
  if (preference === "light" || preference === "dark") return preference;
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return null;
};

export function applyTheme(preference: string): void {
  const root = document.documentElement;
  const resolved = _resolveTheme(preference);
  if (resolved === "light") {
    root.setAttribute("data-theme", "light");
  } else if (resolved === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
}

export async function initTheme(): Promise<void> {
  const saved = await idbGet<string>(THEME_KEY);
  if (saved) {
    try {
      localStorage.setItem(THEME_KEY, saved);
    } catch {}
    applyTheme(saved);
    return;
  }
  try {
    const res = await fetch("/api/settings/appearance");
    const data = (await res.json()) as { theme?: string };
    if (data.theme && data.theme !== "system") {
      applyTheme(data.theme);
    }
  } catch {}
}
