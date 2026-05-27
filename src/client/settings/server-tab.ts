import { copyTextToClipboard } from "../utils/clipboard";
import { getBase } from "../utils/base-url";
import { authHeaders } from "../utils/request";
import { initProxyTest } from "./proxy-test";
import {
  type BoolSetting,
  bindToggle,
  el,
  setToggle,
  setVal,
} from "./server/fields";
import { renderScoreRows, scoreRowTemplate } from "./server/domain-score";
import { initHoneypot } from "./server/honeypot";
import { bindToggleAutoSave, injectFieldSaveBtns } from "./server/auto-save";

const t = window.scopedT("core");

type ServerSettingsData = {
  proxyEnabled?: BoolSetting;
  proxyUrls?: string;
  imageProxyAllowLocal?: BoolSetting;
  imageProxyAllowList?: string;
  rateLimitEnabled?: BoolSetting;
  rateLimitBurstWindow?: string;
  rateLimitBurstMax?: string;
  rateLimitLongWindow?: string;
  rateLimitLongMax?: string;
  rateLimitSuggestEnabled?: BoolSetting;
  rateLimitSuggestBurstWindow?: string;
  rateLimitSuggestBurstMax?: string;
  rateLimitSuggestLongWindow?: string;
  rateLimitSuggestLongMax?: string;
  acDebounceMs?: string;
  languagesEnabled?: BoolSetting;
  languages?: string;
  streamingEnabled?: BoolSetting;
  streamingAutoRetry?: BoolSetting;
  streamingMaxRetries?: string;
  domainBlockEnabled?: BoolSetting;
  domainBlockList?: string;
  domainBlockUiEnabled?: BoolSetting;
  domainReplaceEnabled?: BoolSetting;
  domainReplaceList?: string;
  domainReplaceUiEnabled?: BoolSetting;
  domainScoreEnabled?: BoolSetting;
  domainScoreList?: string;
  domainScoreUiEnabled?: BoolSetting;
  customCss?: string;
  apiKeySearchEnabled?: BoolSetting;
  apiKeySuggestEnabled?: BoolSetting;
  honeypotEnabled?: BoolSetting;
  honeypotCssCheck?: BoolSetting;
  honeypotBanDuration?: string;
};

let _apiKey = "";
let _keyRevealed = false;

function _renderApiKey(): void {
  const element = document.getElementById("settings-api-key-value");
  if (!element) return;
  element.textContent = _keyRevealed
    ? _apiKey
    : "•".repeat(Math.min(_apiKey.length, 32));
}

async function _loadServerSettings(getToken: () => string | null): Promise<void> {
  try {
    const res = await fetch(`${getBase()}/api/settings/general`, {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return;
    const data = (await res.json()) as ServerSettingsData;

    setToggle("proxy-enabled", data.proxyEnabled);
    setVal("proxy-urls", data.proxyUrls);
    setToggle("image-proxy-allow-local", data.imageProxyAllowLocal);
    setVal("image-proxy-allow-list", data.imageProxyAllowList);

    setToggle("languages-enabled", data.languagesEnabled);
    setVal("languages", data.languages);

    setToggle("rate-limit-enabled", data.rateLimitEnabled);
    setVal("rate-limit-burst-window", data.rateLimitBurstWindow);
    setVal("rate-limit-burst-max", data.rateLimitBurstMax);
    setVal("rate-limit-long-window", data.rateLimitLongWindow);
    setVal("rate-limit-long-max", data.rateLimitLongMax);
    setToggle("rate-limit-suggest-enabled", data.rateLimitSuggestEnabled);
    setVal("rate-limit-suggest-burst-window", data.rateLimitSuggestBurstWindow);
    setVal("rate-limit-suggest-burst-max", data.rateLimitSuggestBurstMax);
    setVal("rate-limit-suggest-long-window", data.rateLimitSuggestLongWindow);
    setVal("rate-limit-suggest-long-max", data.rateLimitSuggestLongMax);
    setVal("ac-debounce-ms", data.acDebounceMs);

    setToggle("streaming-enabled", data.streamingEnabled);
    setToggle("streaming-auto-retry", data.streamingAutoRetry);
    setVal("streaming-max-retries", data.streamingMaxRetries);

    setToggle("domain-block-enabled", data.domainBlockEnabled);
    setVal("domain-block-list", data.domainBlockList);
    setToggle("domain-block-ui-enabled", data.domainBlockUiEnabled);

    setToggle("domain-replace-enabled", data.domainReplaceEnabled);
    setVal("domain-replace-list", data.domainReplaceList);
    setToggle("domain-replace-ui-enabled", data.domainReplaceUiEnabled);

    setToggle("domain-score-enabled", data.domainScoreEnabled);
    renderScoreRows(data.domainScoreList ?? "");
    setToggle("domain-score-ui-enabled", data.domainScoreUiEnabled);

    setVal("custom-css", data.customCss);

    setToggle("api-key-search-enabled", data.apiKeySearchEnabled);
    setToggle("api-key-suggest-enabled", data.apiKeySuggestEnabled);

    setToggle("honeypot-enabled", data.honeypotEnabled ?? "true");
    setToggle("honeypot-css-check", data.honeypotCssCheck ?? "true");
    setVal("honeypot-ban-duration", data.honeypotBanDuration);
  } catch {}
}

const _bindToggles = (): void => {
  bindToggle("proxy-enabled", "proxy-urls-wrap");
  bindToggle("image-proxy-allow-local", "image-proxy-allow-list-wrap");
  bindToggle("languages-enabled", "languages-wrap");
  bindToggle("rate-limit-enabled", "rate-limit-options");
  bindToggle("rate-limit-suggest-enabled", "rate-limit-suggest-options");
  bindToggle("streaming-enabled", "streaming-options");
  bindToggle("streaming-auto-retry", "streaming-retry-wrap");
  bindToggle("domain-block-enabled", "domain-block-wrap");
  bindToggle("domain-replace-enabled", "domain-replace-wrap");
  bindToggle("domain-score-enabled", "domain-score-wrap");
};

type ButtonStateHandler = (
  id: string,
  action: () => Promise<void>,
  successKey: string,
  failKey?: string,
) => void;

const _initApiKeyControls = (
  getToken: () => string | null,
  handleButtonState: ButtonStateHandler,
): void => {
  document
    .getElementById("settings-api-key-reveal")
    ?.addEventListener("click", () => {
      _keyRevealed = !_keyRevealed;
      _renderApiKey();
      const btn = document.getElementById("settings-api-key-reveal");
      if (btn)
        btn.innerHTML = _keyRevealed
          ? `<i class="fa-solid fa-eye-slash fa-lg"></i>`
          : `<i class="fa-solid fa-eye fa-lg"></i>`;
      if (btn)
        btn.setAttribute(
          "aria-label",
          t(
            _keyRevealed
              ? "settings-page.server.api-key-hide"
              : "settings-page.server.api-key-reveal",
          ),
        );
    });

  document
    .getElementById("settings-api-key-copy")
    ?.addEventListener("click", () => {
      if (!_apiKey) return;
      const btn = document.getElementById("settings-api-key-copy");
      if (!btn) return;
      const prevInner = btn.innerHTML;
      void copyTextToClipboard(_apiKey).then((ok) => {
        if (!ok) return;
        btn.textContent = t("settings-page.server.api-key-copied");
        setTimeout(() => {
          btn.innerHTML = prevInner;
        }, 1200);
      });
    });

  handleButtonState(
    "settings-api-key-regenerate",
    async () => {
      const res = await fetch(`${getBase()}/api/settings/api-key/regenerate`, {
        method: "POST",
        headers: authHeaders(getToken),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { key: string };
      _apiKey = data.key;
      _keyRevealed = false;
      _renderApiKey();
      const revealBtn = document.getElementById("settings-api-key-reveal");
      if (revealBtn)
        revealBtn.textContent = t("settings-page.server.api-key-reveal");
    },
    "settings-page.server.api-key-regenerated",
    "settings-page.server.api-key-regenerate-failed",
  );
};

export async function initServerTab(
  getToken: () => string | null,
): Promise<void> {
  _bindToggles();

  document
    .getElementById("settings-domain-score-add")
    ?.addEventListener("click", () => {
      const wrap = document.getElementById("settings-domain-score-rows");
      wrap?.appendChild(scoreRowTemplate("", ""));
    });

  if (el("proxy-enabled")) initProxyTest(getToken);

  await _loadServerSettings(getToken);

  try {
    const apiKeyRes = await fetch(`${getBase()}/api/settings/api-key`, {
      headers: authHeaders(getToken),
    });
    if (apiKeyRes.ok) {
      const apiKeyData = (await apiKeyRes.json()) as {
        key: string;
        searchEnabled: boolean;
        suggestEnabled: boolean;
      };
      _apiKey = apiKeyData.key;
      _renderApiKey();
    }
  } catch {}

  initHoneypot(getToken);

  const handleButtonState: ButtonStateHandler = (
    id,
    action,
    successKey,
    failKey,
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

  bindToggleAutoSave(getToken);
  injectFieldSaveBtns(getToken);

  _initApiKeyControls(getToken, handleButtonState);

  const CACHE_SCOPES = ["search", "autocomplete", "extensions", "all"] as const;
  for (const scope of CACHE_SCOPES) {
    handleButtonState(
      `settings-cache-clear-${scope}`,
      async () => {
        const res = await fetch(`${getBase()}/api/cache/clear?scope=${scope}`, {
          method: "POST",
        });
        if (!res.ok) throw new Error();
      },
      "settings-page.server.cache-cleared",
      "settings-page.server.cache-failed",
    );
  }
}
