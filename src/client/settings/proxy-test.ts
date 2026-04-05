import { escapeHtml } from "../utils/dom";
import { authHeaders } from "../utils/request";

const t = window.scopedT("core");

interface ProxyTestResult {
  enabled: boolean;
  directIp: string | null;
  proxyIp: string | null;
  match: boolean | null;
}

function renderResult(el: HTMLElement, data: ProxyTestResult): void {
  if (!data.enabled) {
    el.className = "proxy-test-result proxy-test-result--warn";
    el.textContent = t("settings-page.proxy-test.not-enabled");
    return;
  }

  if (!data.directIp && !data.proxyIp) {
    el.className = "proxy-test-result proxy-test-result--error";
    el.textContent = t("settings-page.proxy-test.ip-unreachable");
    return;
  }

  if (!data.proxyIp) {
    el.className = "proxy-test-result proxy-test-result--error";
    const dip = data.directIp ?? "";
    el.innerHTML =
      `<strong>${escapeHtml(t("settings-page.proxy-test.unreachable-title"))}</strong> ` +
      escapeHtml(
        t("settings-page.proxy-test.unreachable-detail", {
          directIp: dip,
        }),
      ) +
      `<br>${escapeHtml(t("settings-page.proxy-test.unreachable-hint"))}`;
    return;
  }

  if (data.match) {
    el.className = "proxy-test-result proxy-test-result--warn";
    const dip = data.directIp ?? "";
    const pip = data.proxyIp ?? "";
    el.innerHTML =
      `<strong>${escapeHtml(t("settings-page.proxy-test.match-title"))}</strong><br>` +
      escapeHtml(
        t("settings-page.proxy-test.match-detail", {
          directIp: dip,
          proxyIp: pip,
        }),
      ) +
      `<br>${escapeHtml(t("settings-page.proxy-test.match-hint"))}`;
    return;
  }

  el.className = "proxy-test-result proxy-test-result--ok";
  const dip = data.directIp ?? "";
  const pip = data.proxyIp ?? "";
  el.innerHTML =
    `<strong>${escapeHtml(t("settings-page.proxy-test.ok-title"))}</strong><br>` +
    escapeHtml(
      t("settings-page.proxy-test.ok-detail", {
        directIp: dip,
        proxyIp: pip,
      }),
    );
}

export function initProxyTest(getToken: () => string | null): void {
  const btn = document.getElementById(
    "settings-proxy-test",
  ) as HTMLButtonElement | null;
  const resultEl = document.getElementById("settings-proxy-test-result");
  if (!btn || !resultEl) return;

  const labelTest = t("settings-page.server.proxy-test");
  const labelTesting = t("settings-page.server.proxy-testing");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = labelTesting;
    resultEl.hidden = true;

    try {
      const res = await fetch("/api/settings/proxy-test", {
        headers: authHeaders(getToken),
      });
      if (!res.ok) {
        resultEl.className = "proxy-test-result proxy-test-result--error";
        resultEl.textContent = t("settings-page.proxy-test.server-error", {
          status: String(res.status),
        });
        resultEl.hidden = false;
        return;
      }
      const data = (await res.json()) as ProxyTestResult;
      renderResult(resultEl, data);
      resultEl.hidden = false;
    } catch {
      resultEl.className = "proxy-test-result proxy-test-result--error";
      resultEl.textContent = t("settings-page.proxy-test.request-failed");
      resultEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = labelTest;
    }
  });
}
