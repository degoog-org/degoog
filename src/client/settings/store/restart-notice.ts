import { authHeaders } from "../../utils/request";
import { escapeHtml } from "../../utils/dom";
import { getBase } from "../../utils/base-url";

const t = window.scopedT("core");

interface RestartState {
  pending: boolean;
  reasons: string[];
}

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

  const close = (): void => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", onKey);
  overlay
    .querySelectorAll(".store-restart-close, .store-restart-later")
    .forEach((el) => el.addEventListener("click", close));

  document.body.appendChild(overlay);
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
  let state: RestartState;
  try {
    const res = await fetch(`${getBase()}/api/settings/restart-state`, {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return;
    state = (await res.json()) as RestartState;
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
      await fetch(`${getBase()}/api/settings/restart`, {
        method: "POST",
        headers: authHeaders(getToken),
      });
      close();
    } catch (err) {
      console.debug("[store] restart trigger failed", err);
      restartBtn.disabled = false;
      restartBtn.textContent = t("settings-page.restart.button");
    }
  });
}
