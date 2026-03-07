const DISMISS_KEY = "degoog_install_dismissed";
const REQUEST_KEY = "degoog_request_install";

let deferredPrompt = null;

function getBannerContainer() {
  let el = document.getElementById("install-banner-root");
  if (!el) {
    el = document.createElement("div");
    el.id = "install-banner-root";
    document.body.appendChild(el);
  }
  return el;
}

function createBanner() {
  const wrap = document.createElement("div");
  wrap.className = "install-banner";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-label", "Install app");
  wrap.innerHTML = `
    <p class="install-banner-text">Add degoog to your home screen</p>
    <div class="install-banner-actions">
      <button type="button" class="install-banner-btn install-banner-install">Install</button>
      <button type="button" class="install-banner-btn install-banner-dismiss" aria-label="Dismiss">&times;</button>
    </div>
  `;
  const installBtn = wrap.querySelector(".install-banner-install");
  const dismissBtn = wrap.querySelector(".install-banner-dismiss");
  installBtn.addEventListener("click", () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        deferredPrompt = null;
        hideBanner();
      });
    }
  });
  dismissBtn.addEventListener("click", () => {
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch {}
    hideBanner();
  });
  return wrap;
}

function showBanner() {
  const container = getBannerContainer();
  if (container.querySelector(".install-banner")) return;
  const banner = createBanner();
  container.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("install-banner-visible"));
}

function hideBanner() {
  const banner = document.querySelector(".install-banner");
  if (banner) {
    banner.classList.remove("install-banner-visible");
    setTimeout(() => banner.remove(), 200);
  }
}

function isDismissed() {
  try {
    return !!localStorage.getItem(DISMISS_KEY);
  } catch {
    return false;
  }
}

function hasRequestedInstall() {
  try {
    return !!localStorage.getItem(REQUEST_KEY);
  } catch {
    return false;
  }
}

function clearRequestedInstall() {
  try {
    localStorage.removeItem(REQUEST_KEY);
  } catch {}
}

export function initInstallPrompt() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (hasRequestedInstall()) {
      clearRequestedInstall();
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => {
        deferredPrompt = null;
      });
    } else if (!isDismissed()) {
      showBanner();
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    clearRequestedInstall();
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch {}
    hideBanner();
  });
}

export function requestInstallPrompt() {
  try {
    localStorage.setItem(REQUEST_KEY, "1");
  } catch {}
  window.location.href = "/";
}
