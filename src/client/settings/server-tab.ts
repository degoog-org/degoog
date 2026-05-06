import { copyTextToClipboard } from "../utils/clipboard";
import { getBase } from "../utils/base-url";
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
  rateLimitSuggestEnabled?: string;
  rateLimitSuggestBurstWindow?: string;
  rateLimitSuggestBurstMax?: string;
  rateLimitSuggestLongWindow?: string;
  rateLimitSuggestLongMax?: string;
  acDebounceMs?: string;
  languagesEnabled?: string;
  languages?: string;
  streamingEnabled?: string;
  streamingAutoRetry?: string;
  streamingMaxRetries?: string;
  domainBlockEnabled?: string;
  domainBlockList?: string;
  domainBlockUiEnabled?: string;
  domainReplaceEnabled?: string;
  domainReplaceList?: string;
  domainReplaceUiEnabled?: string;
  domainScoreEnabled?: string;
  domainScoreList?: string;
  domainScoreUiEnabled?: string;
  customCss?: string;
  apiKeySearchEnabled?: string;
  apiKeySuggestEnabled?: string;
};

const _scoreT = window.scopedT("core");

const _scoreRowTemplate = (domain: string, score: string): HTMLDivElement => {
  const row = document.createElement("div");
  row.className="settings-score-row";

  const domainInput = document.createElement("input");
  domainInput.type = "text";
  domainInput.className="settings-score-domain degoog-input";
  domainInput.placeholder = _scoreT(
    "settings-page.server.domain-score-domain-placeholder",
  );
  domainInput.value = domain;

  const scoreInput = document.createElement("input");
  scoreInput.type = "number";
  scoreInput.className="settings-score-value degoog-input";
  scoreInput.placeholder = _scoreT(
    "settings-page.server.domain-score-value-placeholder",
  );
  scoreInput.value = score;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className="settings-score-remove degoog-icon-btn";
  remove.setAttribute(
    "aria-label",
    _scoreT("settings-page.server.domain-score-remove-aria"),
  );
  remove.textContent = "×";
  remove.addEventListener("click", () => row.remove());

  row.append(domainInput, scoreInput, remove);
  return row;
};

function _renderScoreRows(raw: string): void {
  const wrap = document.getElementById("settings-domain-score-rows");
  if (!wrap) return;
  wrap.innerHTML = "";
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .forEach((line) => {
      const [domain, score] = line.split("|").map((s) => s.trim());
      wrap.appendChild(_scoreRowTemplate(domain ?? "", score ?? ""));
    });
}

const _serializeScoreRows = (): string => {
  const wrap = document.getElementById("settings-domain-score-rows");
  if (!wrap) return "";
  const lines: string[] = [];
  wrap
    .querySelectorAll<HTMLDivElement>(".settings-score-row")
    .forEach((row) => {
      const domain = row
        .querySelector<HTMLInputElement>(".settings-score-domain")
        ?.value.trim();
      const score = row
        .querySelector<HTMLInputElement>(".settings-score-value")
        ?.value.trim();
      if (!domain || !score) return;
      if (!Number.isFinite(Number(score))) return;
      lines.push(`${domain}|${Math.trunc(Number(score))}`);
    });
  return lines.join("\n");
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

let _apiKey = "";
let _keyRevealed = false;

function _renderApiKey(): void {
  const element = document.getElementById("settings-api-key-value");
  if (!element) return;
  element.textContent = _keyRevealed
    ? _apiKey
    : "•".repeat(Math.min(_apiKey.length, 32));
}

export async function initServerTab(
  getToken: () => string | null,
): Promise<void> {
  _bindToggle("proxy-enabled", "proxy-urls-wrap");
  _bindToggle("languages-enabled", "languages-wrap");
  _bindToggle("rate-limit-enabled", "rate-limit-options");
  _bindToggle("rate-limit-suggest-enabled", "rate-limit-suggest-options");
  _bindToggle("streaming-enabled", "streaming-options");
  _bindToggle("streaming-auto-retry", "streaming-retry-wrap");
  _bindToggle("domain-block-enabled", "domain-block-wrap");
  _bindToggle("domain-replace-enabled", "domain-replace-wrap");
  _bindToggle("domain-score-enabled", "domain-score-wrap");

  document
    .getElementById("settings-domain-score-add")
    ?.addEventListener("click", () => {
      const wrap = document.getElementById("settings-domain-score-rows");
      wrap?.appendChild(_scoreRowTemplate("", ""));
    });

  if (el("proxy-enabled")) initProxyTest(getToken);

  try {
    const res = await fetch(`${getBase()}/api/settings/general`, {
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
      _setToggle("rate-limit-suggest-enabled", data.rateLimitSuggestEnabled);
      _setVal("rate-limit-suggest-burst-window", data.rateLimitSuggestBurstWindow);
      _setVal("rate-limit-suggest-burst-max", data.rateLimitSuggestBurstMax);
      _setVal("rate-limit-suggest-long-window", data.rateLimitSuggestLongWindow);
      _setVal("rate-limit-suggest-long-max", data.rateLimitSuggestLongMax);
      _setVal("ac-debounce-ms", data.acDebounceMs);

      _setToggle("streaming-enabled", data.streamingEnabled);
      _setToggle("streaming-auto-retry", data.streamingAutoRetry);
      _setVal("streaming-max-retries", data.streamingMaxRetries);

      _setToggle("domain-block-enabled", data.domainBlockEnabled);
      _setVal("domain-block-list", data.domainBlockList);
      _setToggle("domain-block-ui-enabled", data.domainBlockUiEnabled);

      _setToggle("domain-replace-enabled", data.domainReplaceEnabled);
      _setVal("domain-replace-list", data.domainReplaceList);
      _setToggle("domain-replace-ui-enabled", data.domainReplaceUiEnabled);

      _setToggle("domain-score-enabled", data.domainScoreEnabled);
      _renderScoreRows(data.domainScoreList ?? "");
      _setToggle("domain-score-ui-enabled", data.domainScoreUiEnabled);

      _setVal("custom-css", data.customCss);

      _setToggle("api-key-search-enabled", data.apiKeySearchEnabled);
      _setToggle("api-key-suggest-enabled", data.apiKeySuggestEnabled);
    }
  } catch {}

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

  const getRateLimitPayload = () => {
    const enabled = el("rate-limit-enabled")?.checked;
    const payload: Record<string, string> = {
      rateLimitEnabled: enabled ? "true" : "false",
    };

    if (enabled) {
      const _rl = (id: string) => {
        const input = el(id);
        return input?.value.trim() || input?.placeholder || "";
      };
      Object.assign(payload, {
        rateLimitBurstWindow: _rl("rate-limit-burst-window"),
        rateLimitBurstMax: _rl("rate-limit-burst-max"),
        rateLimitLongWindow: _rl("rate-limit-long-window"),
        rateLimitLongMax: _rl("rate-limit-long-max"),
      });

      const suggestEnabled = el("rate-limit-suggest-enabled")?.checked;
      payload.rateLimitSuggestEnabled = suggestEnabled ? "true" : "false";
      if (suggestEnabled) {
        Object.assign(payload, {
          rateLimitSuggestBurstWindow: _rl("rate-limit-suggest-burst-window"),
          rateLimitSuggestBurstMax: _rl("rate-limit-suggest-burst-max"),
          rateLimitSuggestLongWindow: _rl("rate-limit-suggest-long-window"),
          rateLimitSuggestLongMax: _rl("rate-limit-suggest-long-max"),
        });
      }
      payload.acDebounceMs = _rl("ac-debounce-ms");
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
      await fetch(`${getBase()}/api/settings/general`, {
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
          domainBlockUiEnabled: boolStr("domain-block-ui-enabled"),
          domainReplaceEnabled: boolStr("domain-replace-enabled"),
          domainReplaceList: val("domain-replace-list"),
          domainReplaceUiEnabled: boolStr("domain-replace-ui-enabled"),
          domainScoreEnabled: boolStr("domain-score-enabled"),
          domainScoreList: _serializeScoreRows(),
          domainScoreUiEnabled: boolStr("domain-score-ui-enabled"),
          customCss: val("custom-css"),
          apiKeySearchEnabled: boolStr("api-key-search-enabled"),
          apiKeySuggestEnabled: boolStr("api-key-suggest-enabled"),
        }),
      });
    },
    "settings-page.server.saved",
  );

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

  handleButtonState(
    "settings-cache-clear",
    async () => {
      const res = await fetch(`${getBase()}/api/cache/clear`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
    },
    "settings-page.server.cache-cleared",
    "settings-page.server.cache-failed",
  );
}
