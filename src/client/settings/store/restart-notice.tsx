import { authHeaders } from "../../utils/request";
import { getBase } from "../../utils/base-url";
import { render } from "../../../shared/ui/core/dom";
import { RestartNoticeModal } from "./restart-notice-modal";
import { fetchRestartState } from "../shared/restart-state";

const t = window.scopedT("core");

const DISMISSED_KEY = "store-restart-dismissed";

let lastShownReasons = "";
let checkInFlight = false;
let noticeOpen = false;

const readDismissed = (): string => {
  try {
    return localStorage.getItem(DISMISSED_KEY) ?? "";
  } catch {
    return "";
  }
};

const writeDismissed = (key: string): void => {
  try {
    if (key) localStorage.setItem(DISMISSED_KEY, key);
    else localStorage.removeItem(DISMISSED_KEY);
  } catch (err) {
    console.debug("[store] restart dismissal persist failed", err);
  }
};

function buildModal(reasons: string[]): {
  overlay: HTMLElement;
  restartBtn: HTMLButtonElement;
  close: () => void;
} {
  const overlay = document.createElement("div");
  overlay.className = "ext-modal-overlay store-restart-overlay";
  render(
    <RestartNoticeModal
      reasons={reasons}
      onClose={() => close()}
      onLater={() => {
        writeDismissed(JSON.stringify(reasons));
        close();
      }}
    />,
    overlay,
  );

  const previouslyFocused = document.activeElement as HTMLElement | null;
  const dialog = overlay.querySelector<HTMLElement>(".ext-modal")!;

  const getFocusable = (): HTMLElement[] =>
    Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      ),
    ).filter((el) => !el.hasAttribute("disabled"));

  const close = (): void => {
    noticeOpen = false;
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

  document.body.appendChild(overlay);
  noticeOpen = true;
  getFocusable()[0]?.focus();
  return {
    overlay,
    restartBtn: overlay.querySelector<HTMLButtonElement>(
      ".store-restart-confirm",
    )!,
    close,
  };
}

export const pendingReasons = async (
  getToken: () => string | null,
): Promise<string[] | null> => {
  const state = await fetchRestartState(getToken);
  if (!state) return null;

  if (!state.pending) {
    writeDismissed("");
    if (!noticeOpen) lastShownReasons = "";
    return null;
  }

  const key = JSON.stringify(state.reasons);
  if (key === lastShownReasons || key === readDismissed()) return null;
  lastShownReasons = key;
  return state.reasons;
};

export async function maybeShowRestartNotice(
  getToken: () => string | null,
): Promise<void> {
  if (checkInFlight) return;
  checkInFlight = true;

  let reasons: string[] | null;
  try {
    reasons = await pendingReasons(getToken);
  } finally {
    checkInFlight = false;
  }
  if (!reasons) return;

  const { restartBtn, close } = buildModal(reasons);
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
