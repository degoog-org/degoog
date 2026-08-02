import { authHeaders } from "../../utils/request";
import { escapeHtml } from "../../utils/dom";
import { getBase } from "../../utils/base-url";
import { isRestartState } from "../../../shared/restart-state";

const t = window.scopedT("core");

let lastShownReasons = "";

const REASON_RE = /^(\w+) "(.+)" was \w+$/;

const formatReason = (reason: string): string => {
  const parsed = REASON_RE.exec(reason);
  if (!parsed) return reason;
  const [, type, name] = parsed;
  return `${type[0].toUpperCase()}${type.slice(1)} - ${name}`;
};

function buildModal(reasons: string[]): {
  overlay: HTMLElement;
  restartBtn: HTMLButtonElement;
  close: () => void;
} {
  const overlay = document.createElement("div");
  overlay.className = "ext-modal-overlay store-restart-overlay";
  overlay.innerHTML = `
    <div class="ext-modal" role="dialog" aria-modal="true" aria-labelledby="store-restart-title">
      <div class="ext-modal-header">
        <h2 class="ext-modal-title" id="store-restart-title">${escapeHtml(t("settings-page.restart.heading"))}</h2>
        <button class="ext-modal-close degoog-icon-btn store-restart-close" type="button" aria-label="${escapeHtml(t("settings-page.restart.later"))}">&times;</button>
      </div>
      <div class="ext-modal-body">
        <p class="store-restart-intro">${escapeHtml(t("settings-page.restart.modal-intro"))}</p>
        <ul class="store-restart-list">
          ${reasons.map((r) => `<li>• ${escapeHtml(formatReason(r))}</li>`).join("")}
        </ul>
        <p class="store-restart-note">${escapeHtml(t("settings-page.restart.modal-note"))}</p>
      </div>
      <div class="ext-modal-footer store-restart-footer">
        <button class="btn btn--secondary degoog-btn degoog-btn--secondary store-restart-confirm" type="button">${escapeHtml(t("settings-page.restart.button"))}</button>
        <button class="btn btn--primary degoog-btn degoog-btn--primary store-restart-later" type="button">${escapeHtml(t("settings-page.restart.later"))}</button>
      </div>
    </div>`;

  const previouslyFocused = document.activeElement as HTMLElement | null;
  const dialog = overlay.querySelector<HTMLElement>(".ext-modal")!;

  const getFocusable = (): HTMLElement[] =>
    Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      ),
    ).filter((el) => !el.hasAttribute("disabled"));

  const close = (): void => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    previouslyFocused?.focus();
  };
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = getFocusable();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKey);
  overlay
    .querySelectorAll(".store-restart-close, .store-restart-later")
    .forEach((el) => el.addEventListener("click", close));

  document.body.appendChild(overlay);
  getFocusable()[0]?.focus();
  return {
    overlay,
    restartBtn: overlay.querySelector<HTMLButtonElement>(
      ".store-restart-confirm",
    )!,
    close,
  };
}

export async function maybeShowRestartNotice(
  getToken: () => string | null,
): Promise<void> {
  let state;
  try {
    const res = await fetch(`${getBase()}/api/settings/restart-state`, {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return;
    const payload: unknown = await res.json();
    if (!isRestartState(payload)) {
      console.debug("[store] restart state payload invalid", payload);
      return;
    }
    state = payload;
  } catch (err) {
    console.debug("[store] restart state fetch failed", err);
    return;
  }

  const key = state.reasons.join("|");
  if (!state.pending || key === lastShownReasons) return;
  lastShownReasons = key;

  const { restartBtn, close } = buildModal(state.reasons);
  restartBtn.addEventListener("click", async () => {
    restartBtn.disabled = true;
    restartBtn.textContent = t("settings-page.restart.restarting");
    try {
      const res = await fetch(`${getBase()}/api/settings/restart`, {
        method: "POST",
        headers: authHeaders(getToken),
      });
      if (!res.ok) throw new Error(`restart request failed: ${res.status}`);
      close();
    } catch (err) {
      console.debug("[store] restart trigger failed", err);
      restartBtn.disabled = false;
      restartBtn.textContent = t("settings-page.restart.button");
    }
  });
}
