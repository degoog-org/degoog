import { render } from "../../../../shared/ui/tribute/dom";
import { onBackdropClick } from "../../../../shared/ui/components/overlay/shell";
import { RESTART_CONFIRM_CLASS, RestartNoticeModal } from "./restart-notice-modal";
import { fetchRestartState } from "../../shared/restart-state";
import { focusableIn, wrapTab } from "../../../utils/dom/focus-trap";

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
  overlay.className = "ext-modal-overlay";
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
    wrapTab(e, dialog);
  }

  onBackdropClick(overlay, close);
  document.addEventListener("keydown", onKey);

  document.body.appendChild(overlay);
  noticeOpen = true;
  focusableIn(dialog)[0]?.focus();
  return {
    overlay,
    restartBtn: overlay.querySelector<HTMLButtonElement>(
      `.${RESTART_CONFIRM_CLASS}`,
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
  onRestart: () => void,
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
  restartBtn.addEventListener("click", () => {
    close();
    onRestart();
  });
}
