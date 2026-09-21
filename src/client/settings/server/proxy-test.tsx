import { render } from "../../../shared/ui/core/dom";
import { ProxyTestMessage } from "./proxy-test-message";
import { getBase } from "../../utils/base-url";
import { jsonHeaders } from "../../utils/request";
import type { ProxyTestResult } from "../../types/settings-proxy";

const t = window.scopedT("core");

function renderResult(el: HTMLElement, data: ProxyTestResult): void {
  if (!data.enabled) {
    el.className="proxy-test-result proxy-test-result--warn";
    el.textContent = t("settings-page.proxy-test.not-enabled");
    return;
  }

  if (!data.directIp && !data.proxyIp) {
    el.className="proxy-test-result proxy-test-result--error";
    el.textContent = t("settings-page.proxy-test.ip-unreachable");
    return;
  }

  if (!data.proxyIp) {
    el.className="proxy-test-result proxy-test-result--error";
    const dip = data.directIp ?? "";
    render(
      <ProxyTestMessage
        title={t("settings-page.proxy-test.unreachable-title")}
        detail={t("settings-page.proxy-test.unreachable-detail", { directIp: dip })}
        hint={t("settings-page.proxy-test.unreachable-hint")}
        breakAfterTitle={false}
      />,
      el,
    );
    return;
  }

  if (data.match) {
    el.className="proxy-test-result proxy-test-result--warn";
    const dip = data.directIp ?? "";
    const pip = data.proxyIp ?? "";
    render(
      <ProxyTestMessage
        title={t("settings-page.proxy-test.match-title")}
        detail={t("settings-page.proxy-test.match-detail", { directIp: dip, proxyIp: pip })}
        hint={t("settings-page.proxy-test.match-hint")}
        breakAfterTitle={true}
      />,
      el,
    );
    return;
  }

  el.className="proxy-test-result proxy-test-result--ok";
  const dip = data.directIp ?? "";
  const pip = data.proxyIp ?? "";
  render(
    <ProxyTestMessage
      title={t("settings-page.proxy-test.ok-title")}
      detail={t("settings-page.proxy-test.ok-detail", { directIp: dip, proxyIp: pip })}
      breakAfterTitle={true}
    />,
    el,
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

    const enabledEl = document.getElementById("settings-proxy-enabled") as HTMLInputElement | null;
    const urlsEl = document.getElementById("settings-proxy-urls") as HTMLTextAreaElement | null;

    try {
      const res = await fetch(`${getBase()}/api/settings/proxy-test`, {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify({
          proxyEnabled: enabledEl?.checked ? "true" : "false",
          proxyUrls: urlsEl?.value ?? "",
        }),
      });
      if (!res.ok) {
        resultEl.className="proxy-test-result proxy-test-result--error";
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
      resultEl.className="proxy-test-result proxy-test-result--error";
      resultEl.textContent = t("settings-page.proxy-test.request-failed");
      resultEl.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = labelTest;
    }
  });
}
