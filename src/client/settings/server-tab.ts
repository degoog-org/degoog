import { getInputElement } from "../utils/dom";
import { authHeaders, jsonHeaders } from "../utils/request";
import { initProxyTest } from "./proxy-test";

const t = window.scopedT("core");

type ServerSettingsData = {
  proxyEnabled?: string;
  proxyUrls?: string;
  rateLimitEnabled?: string;
  rateLimitBurstWindow?: string;
  rateLimitBurstMax?: string;
  rateLimitLongWindow?: string;
  rateLimitLongMax?: string;
  languagesEnabled?: string;
  languages?: string;
  streamingEnabled?: string;
  streamingAutoRetry?: string;
  streamingMaxRetries?: string;
  domainBlockEnabled?: string;
  domainBlockList?: string;
  domainReplaceEnabled?: string;
  domainReplaceList?: string;
};

const el = (id: string) => getInputElement(`settings-${id}`);
const val = (id: string) => el(id)?.value.trim() ?? "";
const boolStr = (id: string) => (el(id)?.checked ? "true" : "false");

function _bindToggle(checkboxId: string, wrapId: string) {
  const checkbox = el(checkboxId);
  const wrap = el(wrapId);
  if (checkbox && wrap) {
    const update = () => {
      wrap.style.display = checkbox.checked ? "block" : "none";
    };
    checkbox.addEventListener("change", update);
    update();
  }
}

function _setToggle(id: string, state?: string) {
  const checkbox = el(id);
  if (checkbox && state !== undefined) {
    checkbox.checked = state === "true";
    checkbox.dispatchEvent(new Event("change"));
  }
}

function _setVal(id: string, value?: string) {
  const element = el(id);
  if (element && value !== undefined) element.value = value;
}

export async function initServerTab(
  getToken: () => string | null,
): Promise<void> {
  _bindToggle("proxy-enabled", "proxy-urls-wrap");
  _bindToggle("languages-enabled", "languages-wrap");
  _bindToggle("rate-limit-enabled", "rate-limit-options");
  _bindToggle("streaming-enabled", "streaming-options");
  _bindToggle("streaming-auto-retry", "streaming-retry-wrap");
  _bindToggle("domain-block-enabled", "domain-block-wrap");
  _bindToggle("domain-replace-enabled", "domain-replace-wrap");

  if (el("proxy-enabled")) initProxyTest(getToken);

  try {
    const res = await fetch("/api/settings/general", {
      headers: authHeaders(getToken),
    });
    if (res.ok) {
      const data = (await res.json()) as ServerSettingsData;

      _setToggle("proxy-enabled", data.proxyEnabled);
      _setVal("proxy-urls", data.proxyUrls);

      _setToggle("languages-enabled", data.languagesEnabled);
      _setVal("languages", data.languages);

      _setToggle("rate-limit-enabled", data.rateLimitEnabled);
      _setVal("rate-limit-burst-window", data.rateLimitBurstWindow);
      _setVal("rate-limit-burst-max", data.rateLimitBurstMax);
      _setVal("rate-limit-long-window", data.rateLimitLongWindow);
      _setVal("rate-limit-long-max", data.rateLimitLongMax);

      _setToggle("streaming-enabled", data.streamingEnabled);
      _setToggle("streaming-auto-retry", data.streamingAutoRetry);
      _setVal("streaming-max-retries", data.streamingMaxRetries);

      _setToggle("domain-block-enabled", data.domainBlockEnabled);
      _setVal("domain-block-list", data.domainBlockList);

      _setToggle("domain-replace-enabled", data.domainReplaceEnabled);
      _setVal("domain-replace-list", data.domainReplaceList);
    }
  } catch {}

  const getRateLimitPayload = () => {
    const enabled = el("rate-limit-enabled")?.checked;
    const payload: Record<string, string> = {
      rateLimitEnabled: enabled ? "true" : "false",
    };

    if (enabled) {
      const bw = val("rate-limit-burst-window");
      const bm = val("rate-limit-burst-max");
      const lw = val("rate-limit-long-window");
      const lm = val("rate-limit-long-max");

      if (bw && bm && lw && lm) {
        Object.assign(payload, {
          rateLimitBurstWindow: bw,
          rateLimitBurstMax: bm,
          rateLimitLongWindow: lw,
          rateLimitLongMax: lm,
        });
      }
    }

    return payload;
  };

  const handleButtonState = (
    id: string,
    action: () => Promise<void>,
    successKey: string,
    failKey?: string,
  ) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const prev = btn.textContent;
      try {
        await action();
        btn.textContent = t(successKey);
      } catch {
        if (failKey) btn.textContent = t(failKey);
      } finally {
        setTimeout(
          () => {
            btn.textContent = prev;
          },
          failKey ? 1500 : 1200,
        );
      }
    });
  };

  handleButtonState(
    "settings-save",
    async () => {
      await fetch("/api/settings/general", {
        method: "POST",
        headers: jsonHeaders(getToken),
        body: JSON.stringify({
          proxyEnabled: boolStr("proxy-enabled"),
          proxyUrls: val("proxy-urls"),
          languagesEnabled: boolStr("languages-enabled"),
          languages: val("languages"),
          ...getRateLimitPayload(),
          streamingEnabled: boolStr("streaming-enabled"),
          streamingAutoRetry: boolStr("streaming-auto-retry"),
          streamingMaxRetries: val("streaming-max-retries"),
          domainBlockEnabled: boolStr("domain-block-enabled"),
          domainBlockList: val("domain-block-list"),
          domainReplaceEnabled: boolStr("domain-replace-enabled"),
          domainReplaceList: val("domain-replace-list"),
        }),
      });
    },
    "settings-page.server.saved",
  );

  handleButtonState(
    "settings-cache-clear",
    async () => {
      const res = await fetch("/api/cache/clear", { method: "POST" });
      if (!res.ok) throw new Error();
    },
    "settings-page.server.cache-cleared",
    "settings-page.server.cache-failed",
  );
}
