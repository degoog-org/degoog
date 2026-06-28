import { idbGet } from "./db";
import { THEME_KEY } from "../constants";
import { getBase } from "./base-url";

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

const THEME_CSS_LINK_ID = "degoog-theme-css";
const THEME_ATTRS_MARKER = "data-degoog-theme-attrs";

export async function applyThemeExtension(opts: {
  hasCss: boolean;
  dataAttrs: Record<string, string>;
}): Promise<void> {
  const root = document.documentElement;

  const prev = root.getAttribute(THEME_ATTRS_MARKER);
  if (prev) {
    for (const name of prev.split(",")) {
      if (name) root.removeAttribute(name);
    }
  }
  const names = Object.keys(opts.dataAttrs);
  for (const [name, value] of Object.entries(opts.dataAttrs)) {
    root.setAttribute(name, value);
  }
  if (names.length) root.setAttribute(THEME_ATTRS_MARKER, names.join(","));
  else root.removeAttribute(THEME_ATTRS_MARKER);

  let link = document.getElementById(
    THEME_CSS_LINK_ID,
  ) as HTMLLinkElement | null;

  if (!opts.hasCss) {
    link?.remove();
    return;
  }

  if (!link) {
    link = document.createElement("link");
    link.id = THEME_CSS_LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }

  await new Promise<void>((resolve) => {
    link!.onload = () => resolve();
    link!.onerror = () => resolve();
    link!.href = `${getBase()}/theme/style.css?ts=${Date.now()}`;
  });
}

export async function initTheme(): Promise<void> {
  const saved = await idbGet<string>(THEME_KEY);
  if (saved) {
    try {
      localStorage.setItem(THEME_KEY, saved);
    } catch (err) {
      console.debug("[theme] localStorage sync failed", err);
    }
    applyTheme(saved);
    return;
  }
  try {
    const res = await fetch(`${getBase()}/api/settings/appearance`);
    const data = (await res.json()) as { theme?: string };
    if (data.theme && data.theme !== "system") {
      applyTheme(data.theme);
    }
  } catch (err) {
    console.debug("[theme] appearance settings fetch failed", err);
  }
}
