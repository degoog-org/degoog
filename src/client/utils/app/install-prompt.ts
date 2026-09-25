import { clearSettingsReturn } from "../navigation/navigation";
import { getBase } from "../net/base-url";

const REQUEST_KEY = "degoog_request_install";

let deferredPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

const _hasRequestedInstall = (): boolean => {
  try {
    return !!localStorage.getItem(REQUEST_KEY);
  } catch {
    return false;
  }
};

function _clearRequestedInstall(): void {
  try {
    localStorage.removeItem(REQUEST_KEY);
  } catch (err) {
    console.debug("[install] localStorage clear failed", err);
  }
}

export function initInstallPrompt(): void {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(`${getBase()}/sw.js`, { scope: `${getBase()}/` }).catch((err) => {
    console.debug("[install] service worker registration failed", err);
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    if (_hasRequestedInstall()) {
      _clearRequestedInstall();
      void deferredPrompt.prompt();
      void deferredPrompt.userChoice.then(() => {
        deferredPrompt = null;
      });
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    _clearRequestedInstall();
  });
}

export function requestInstallPrompt(): void {
  if (deferredPrompt) {
    void deferredPrompt.prompt();
    void deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
    });
    return;
  }
  try {
    localStorage.setItem(REQUEST_KEY, "1");
  } catch (err) {
    console.debug("[install] localStorage write failed", err);
  }
  clearSettingsReturn();
  window.location.href = `${getBase()}/`;
}
