import { initTheme } from "./js/theme.js";
import { initInstallPrompt } from "./js/installPrompt.js";
import { initGeneralTab } from "./js/settings/general-tab.js";
import { initEnginesTab } from "./js/settings/engines-tab.js";
import { initPluginsTab } from "./js/settings/plugins-tab.js";
import { initThemesTab } from "./js/settings/themes-tab.js";
import "./js/settings/modal.js";

const TOKEN_KEY = "degoog-settings-token";

function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY) || null;
}

async function checkAuth() {
  const token = getStoredToken();
  const headers = token ? { "x-settings-token": token } : {};
  const res = await fetch("/api/settings/auth", { headers });
  return res.json();
}

function showAuthGate() {
  const page = document.querySelector(".settings-page");
  page.innerHTML = `
    <header class="settings-page-header">
      <a href="/" class="settings-page-back">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back
      </a>
      <h1 class="settings-page-title">Settings</h1>
    </header>
    <div class="settings-auth-gate">
      <p class="settings-auth-desc">Enter the password to access settings.</p>
      <form class="settings-auth-form" id="settings-auth-form" autocomplete="off">
        <input
          class="settings-auth-input"
          type="password"
          id="settings-auth-input"
          placeholder="Password"
          autocomplete="current-password"
          autofocus
        >
        <button class="settings-save" type="submit">Unlock</button>
      </form>
      <p class="settings-auth-error" id="settings-auth-error"></p>
    </div>`;

  document.getElementById("settings-auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = document.getElementById("settings-auth-input").value;
    const errorEl = document.getElementById("settings-auth-error");
    errorEl.textContent = "";
    try {
      const res = await fetch("/api/settings/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok && data.token) {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        window.location.reload();
      } else {
        errorEl.textContent = "Incorrect password.";
      }
    } catch {
      errorEl.textContent = "Something went wrong. Please try again.";
    }
  });
}

function initTabs() {
  const nav = document.getElementById("settings-tabs-nav");
  if (!nav) return;
  nav.querySelectorAll(".settings-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      nav.querySelectorAll(".settings-tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".settings-tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add("active");
    });
  });
}

async function initSettings() {
  initTheme();
  initInstallPrompt();
  initTabs();
  initGeneralTab();

  try {
    const [extRes, themesRes] = await Promise.all([
      fetch("/api/extensions", {
        headers: getStoredToken() ? { "x-settings-token": getStoredToken() } : {},
      }),
      fetch("/api/themes"),
    ]);
    const allExtensions = await extRes.json();
    const themesData = await themesRes.json();
    await initEnginesTab(allExtensions);
    initPluginsTab(allExtensions);
    await initThemesTab(themesData, allExtensions.themes ?? []);
  } catch {
    document.getElementById("engines-content").innerHTML = "<p>Failed to load extensions.</p>";
    document.getElementById("plugins-content").innerHTML = "<p>Failed to load extensions.</p>";
    const themesEl = document.getElementById("themes-content");
    if (themesEl) themesEl.innerHTML = "<p>Failed to load themes.</p>";
  }
}

async function init() {
  initTheme();
  const auth = await checkAuth();
  if (auth.required && !auth.valid) {
    showAuthGate();
  } else {
    initSettings();
  }
}

init();
