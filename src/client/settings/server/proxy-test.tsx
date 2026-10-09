import { render } from "../../../shared/ui/tribute/dom";
import { ProxyTestReport } from "./proxy-test-message";
import {
  applyProxyResults,
  currentProxyRows,
  markProxiesPending,
} from "./proxies/proxy-state";
import { getBase } from "../../utils/net/base-url";
import { jsonHeaders } from "../../utils/net/request";
import type { ProxyRow, ProxyTestResult } from "../../types/settings-proxy";

const t = window.scopedT("core");

const _reportClass = (data: ProxyTestResult): string => {
  const working = data.proxies.filter((p) => p.ok);
  if (working.length === 0) return "proxy-test-result--error";
  const leaking = working.some((p) => p.ip === data.directIp);
  return leaking || working.length < data.proxies.length
    ? "proxy-test-result--warn"
    : "proxy-test-result--ok";
};

function renderResult(el: HTMLElement, data: ProxyTestResult, rows: ProxyRow[]): void {
  if (!data.enabled) {
    el.className = "proxy-test-result proxy-test-result--warn";
    el.textContent = t("settings-page.proxy-test.not-enabled");
    return;
  }

  if (!data.directIp && !data.proxies.some((p) => p.ok)) {
    el.className = "proxy-test-result proxy-test-result--error";
    el.textContent = t("settings-page.proxy-test.ip-unreachable");
    return;
  }

  el.className = `proxy-test-result ${_reportClass(data)}`;
  render(
    <ProxyTestReport directIp={data.directIp} rows={rows} results={data.proxies} />,
    el,
  );
}

function _showError(el: HTMLElement, text: string): void {
  el.className = "proxy-test-result proxy-test-result--error";
  el.textContent = text;
  el.hidden = false;
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

    const enabledEl = document.getElementById(
      "settings-proxy-enabled",
    ) as HTMLInputElement | null;
    const enabled = !!enabledEl?.checked;
    const targets = enabled ? markProxiesPending(currentProxyRows()) : [];

    try {
      const res = await fetch(`${getBase()}/api/settings/proxy-test`, {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify({
          proxyEnabled: enabled ? "true" : "false",
          proxyUrls: targets.map((row) => row.url).join("\n"),
        }),
      });
      if (!res.ok) {
        applyProxyResults(targets, []);
        _showError(resultEl, t("settings-page.proxy-test.server-error", {
          status: String(res.status),
        }));
        return;
      }
      const data = (await res.json()) as ProxyTestResult;
      applyProxyResults(targets, data.proxies, data.directIp);
      renderResult(resultEl, data, targets);
      resultEl.hidden = false;
    } catch {
      applyProxyResults(targets, []);
      _showError(resultEl, t("settings-page.proxy-test.request-failed"));
    } finally {
      btn.disabled = false;
      btn.textContent = labelTest;
    }
  });
}
