const FLASH_ID = "degoog-flash";
const DISMISS_MS = 3500;
let dismissTimer: number | null = null;

const _mount = (): HTMLElement => {
  const existing = document.getElementById(FLASH_ID);
  if (existing) return existing;
  const el = document.createElement("div");
  el.id = FLASH_ID;
  el.setAttribute("role", "alert");
  el.setAttribute("aria-live", "assertive");
  document.body.appendChild(el);
  return el;
};

const _flash = (msg: string, mod: "error" | "success"): void => {
  const el = _mount();
  el.textContent = msg;
  el.className = `degoog-flash degoog-flash--${mod} degoog-flash--visible`;

  if (dismissTimer !== null) window.clearTimeout(dismissTimer);

  dismissTimer = window.setTimeout(() => {
    el.className = "degoog-flash";
    dismissTimer = null;
  }, DISMISS_MS);
};

export const flashError = (msg: string): void => _flash(msg, "error");
export const flashSuccess = (msg: string): void => _flash(msg, "success");
