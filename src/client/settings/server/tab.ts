import { copyTextToClipboard } from "../../utils/clipboard";
import { getBase } from "../../utils/base-url";
import { escapeHtml } from "../../utils/dom";
import { getAllSearchTypes } from "../../utils/engines";
import { authHeaders } from "../../utils/request";
import { confirmModal } from "../../modules/modals/confirm-modal/confirm";
import { saveBatch, saveField } from "../../utils/settings-api";
import type {
  ButtonStateHandler,
  ServerSettingsData,
} from "../../types/settings-server";
import { setIndexerNavVisible } from "../indexer/nav";
import { initProxyTest } from "./proxy-test";
import { bindToggle, el, setToggle, setVal, syncToggleWrap } from "./fields";
import { markOversized, oversizedMap } from "../shared/oversized";
import { renderScoreRows, scoreRowTemplate } from "./domain-score";
import { initHoneypot } from "./honeypot";
import { bindToggleAutoSave, injectFieldSaveBtns } from "./auto-save";
import { renderServerContent } from "./render";
import { flashError, flashSuccess } from "../shared/flash-msg";
import {
  PRESET_FIELD_DOM_IDS,
  PRESET_TOGGLE_KEYS,
  SERVER_SETTINGS_PRESETS,
  type ServerPresetValueKey,
  type ServerPresetValues,
  type ServerSettingsPreset,
} from "./presets";

const t = window.scopedT("core");

let _apiKey = "";
let _keyRevealed = false;
let _currentServerSettings: ServerSettingsData = {};

const TOGGLE_WRAP_PAIRS = [
  ["proxy-enabled", "proxy-urls-wrap"],
  ["image-proxy-allow-local", "image-proxy-allow-list-wrap"],
  ["languages-enabled", "languages-wrap"],
  ["rate-limit-enabled", "rate-limit-options"],
  ["rate-limit-suggest-enabled", "rate-limit-suggest-options"],
  ["streaming-enabled", "streaming-options"],
  ["streaming-auto-retry", "streaming-retry-wrap"],
  ["domain-block-enabled", "domain-block-wrap"],
  ["domain-replace-enabled", "domain-replace-wrap"],
  ["domain-score-enabled", "domain-score-wrap"],
] as const;

async function _initStreamingTypeChecks(
  disabledTypes: string,
  getToken: () => string | null,
): Promise<void> {
  const container = document.getElementById("settings-streaming-type-checks");
  if (!container) return;
  const disabled = new Set(disabledTypes.split("\n").map((s) => s.trim()).filter(Boolean));
  let types: string[];
  try {
    types = [...(await getAllSearchTypes())];
  } catch (err) {
    console.warn("[settings] could not load search types for streaming controls", err);
    return;
  }

  if (types.length <= 1) {
    container.remove();
    return;
  }

  let _saving = false;
  let _saveAgain = false;

  const _save = async (): Promise<void> => {
    if (_saving) {
      _saveAgain = true;
      return;
    }
    _saving = true;
    do {
      _saveAgain = false;
      const checks = container.querySelectorAll<HTMLInputElement>("input[type=checkbox]");
      const nowDisabled = [...checks].filter((c) => !c.checked).map((c) => c.value).join("\n");
      const ok = await saveField("streamingDisabledTypes", nowDisabled, getToken);
      if (ok) {
        window.dispatchEvent(new Event("extensions-saved"));
        flashSuccess(t("settings-page.server.saved"));
      } else {
        flashError(t("settings-page.server.save-failed-network"));
      }
    } while (_saveAgain);
    _saving = false;
  };

  container.innerHTML = types.map((type) =>
    `<label class="degoog-checkbox-wrap">
      <input type="checkbox" class="settings-toggle" value="${escapeHtml(type)}"${disabled.has(type) ? "" : " checked"} />
      <span class="degoog-checkbox"><i class="fa-solid fa-check"></i></span>
      <span class="settings-toggle-label">${escapeHtml(type)}</span>
    </label>`,
  ).join("");

  container.querySelectorAll<HTMLInputElement>("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => void _save());
  });
}

function _renderApiKey(): void {
  const element = document.getElementById("settings-api-key-value");
  if (!element) return;
  element.textContent = _keyRevealed
    ? _apiKey
    : "•".repeat(Math.min(_apiKey.length, 32));
}

async function _loadServerSettings(
  getToken: () => string | null,
): Promise<void> {
  try {
    const res = await fetch(`${getBase()}/api/settings/general`, {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return;
    const data = (await res.json()) as ServerSettingsData;
    _currentServerSettings = { ...data };
    const oversized = oversizedMap(data as Record<string, unknown>);

    const setListVal = (id: string, key: string, value?: string): void => {
      const field = el(id);
      const info = oversized[key];
      if (field instanceof HTMLTextAreaElement && info) {
        markOversized(field, info, (vars) => t(`settings-page.server.oversized`, vars));
        return;
      }
      setVal(id, value);
    };

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
    void _initStreamingTypeChecks(data.streamingDisabledTypes ?? "", getToken);

    setToggle("domain-block-enabled", data.domainBlockEnabled);
    setListVal("domain-block-list", "domainBlockList", data.domainBlockList);
    setToggle("domain-block-ui-enabled", data.domainBlockUiEnabled);

    setToggle("domain-replace-enabled", data.domainReplaceEnabled);
    setListVal("domain-replace-list", "domainReplaceList", data.domainReplaceList);
    setToggle("domain-replace-ui-enabled", data.domainReplaceUiEnabled);

    setToggle("domain-score-enabled", data.domainScoreEnabled);
    if (!oversized.domainScoreList) renderScoreRows(data.domainScoreList ?? "");
    setToggle("domain-score-ui-enabled", data.domainScoreUiEnabled);

    setVal("custom-css", data.customCss);

    setToggle("api-key-search-enabled", data.apiKeySearchEnabled);
    setToggle("api-key-suggest-enabled", data.apiKeySuggestEnabled);

    setToggle("honeypot-enabled", data.honeypotEnabled ?? "true");
    setToggle("honeypot-css-check", data.honeypotCssCheck ?? "true");
    setVal("honeypot-ban-duration", data.honeypotBanDuration);

    setToggle("degoog-indexer-enabled", data.degoogIndexerEnabled);
    setIndexerNavVisible(
      data.degoogIndexerEnabled === true || data.degoogIndexerEnabled === "true",
    );
  } catch (err) {
    console.warn("[settings] server settings load failed", err);
  }
}

const _bindToggles = (): void => {
  for (const [toggleId, wrapId] of TOGGLE_WRAP_PAIRS) {
    bindToggle(toggleId, wrapId);
  }
};

const _syncDependentPanels = (): void => {
  for (const [toggleId, wrapId] of TOGGLE_WRAP_PAIRS) {
    syncToggleWrap(toggleId, wrapId);
  }
  const indexer = el("degoog-indexer-enabled");
  setIndexerNavVisible(indexer?.checked === true);
};

const _settingAsString = (
  value: ServerSettingsData[ServerPresetValueKey],
): string => {
  if (value === true) return "true";
  if (value === false) return "false";
  return String(value ?? "");
};

const _displayPresetValue = (value: string): string => {
  if (value === "true") return t("settings-page.server.presets.value-on");
  if (value === "false") return t("settings-page.server.presets.value-off");
  if (!value) return t("settings-page.server.presets.value-empty");
  return value;
};

const _findPreset = (id: string): ServerSettingsPreset | undefined =>
  SERVER_SETTINGS_PRESETS.find((preset) => preset.id === id);

const _currentPresetValue = (key: ServerPresetValueKey): string => {
  const id = PRESET_FIELD_DOM_IDS[key];
  const input = id ? el(id) : null;
  if (input instanceof HTMLInputElement && PRESET_TOGGLE_KEYS.has(key)) {
    return input.checked ? "true" : "false";
  }
  if (input) return input.value.trim();
  return _settingAsString(_currentServerSettings[key]);
};

const _presetChanges = (
  values: ServerPresetValues,
): Array<{ key: ServerPresetValueKey; current: string; next: string }> =>
  Object.entries(values).map(([rawKey, next]) => {
    const key = rawKey as ServerPresetValueKey;
    return {
      key,
      current: _currentPresetValue(key),
      next: String(next ?? ""),
    };
  });

const _renderListItems = (list: HTMLElement, items: string[]): void => {
  list.replaceChildren();
  for (const text of items) {
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  }
};

const _renderPresetPreview = (): void => {
  const select = document.getElementById(
    "settings-server-preset-select",
  ) as HTMLSelectElement | null;
  const preview = document.getElementById("settings-server-preset-preview");
  const desc = document.getElementById("settings-server-preset-description");
  const warningsBlock = document.getElementById("settings-server-preset-warnings");
  const warningList = document.getElementById("settings-server-preset-warning-list");
  const changeList = document.getElementById("settings-server-preset-change-list");
  const status = document.getElementById("settings-server-preset-status");
  const apply = document.getElementById(
    "settings-server-preset-apply",
  ) as HTMLButtonElement | null;
  const preset = select ? _findPreset(select.value) : undefined;
  if (!preset || !preview || !desc || !warningList || !changeList || !warningsBlock) {
    if (preview) preview.hidden = true;
    return;
  }

  preview.hidden = false;
  desc.textContent = t(preset.descriptionKey);
  if (status) status.textContent = "";
  _renderListItems(warningList, preset.warnings.map((key) => t(key)));
  warningsBlock.hidden = preset.warnings.length === 0;

  const changed = _presetChanges(preset.values).filter(
    ({ current, next }) => current !== next,
  );
  if (changed.length === 0) {
    if (apply) apply.disabled = true;
    _renderListItems(changeList, [
      t("settings-page.server.presets.no-changes"),
    ]);
    return;
  }
  if (apply) apply.disabled = false;
  _renderListItems(
    changeList,
    changed.map(({ key, current, next }) =>
      t("settings-page.server.presets.change-row", {
        field: t(`settings-page.server.presets.fields.${key}`),
        current: _displayPresetValue(current),
        next: _displayPresetValue(next),
      }),
    ),
  );
};

const _applyPresetToControls = (values: ServerPresetValues): void => {
  for (const [rawKey, rawValue] of Object.entries(values)) {
    const key = rawKey as ServerPresetValueKey;
    const id = PRESET_FIELD_DOM_IDS[key];
    if (!id) continue;
    const input = el(id);
    if (!input) continue;
    const value = String(rawValue ?? "");
    if (input instanceof HTMLInputElement && PRESET_TOGGLE_KEYS.has(key)) {
      input.checked = value === "true";
    } else {
      input.value = value;
    }
  }
  _syncDependentPanels();
};

const _initPresetControls = (getToken: () => string | null): void => {
  const select = document.getElementById(
    "settings-server-preset-select",
  ) as HTMLSelectElement | null;
  const apply = document.getElementById(
    "settings-server-preset-apply",
  ) as HTMLButtonElement | null;
  const status = document.getElementById("settings-server-preset-status");
  if (!select || !apply) return;

  select.addEventListener("change", _renderPresetPreview);
  apply.addEventListener("click", async () => {
    const preset = _findPreset(select.value);
    if (!preset) return;
    apply.disabled = true;
    if (status) status.textContent = t("settings-page.server.presets.applying");
    const ok = await saveBatch(preset.values, getToken);
    if (!ok) {
      if (status) status.textContent = t("settings-page.server.presets.apply-failed");
      flashError(t("settings-page.server.save-failed-network"));
      apply.disabled = false;
      return;
    }

    _currentServerSettings = {
      ..._currentServerSettings,
      ...preset.values,
    };
    _applyPresetToControls(preset.values);
    if (preset.values.degoogIndexerEnabled !== undefined) {
      window.dispatchEvent(new Event("extensions-saved"));
    }
    _renderPresetPreview();
    if (status) status.textContent = t("settings-page.server.presets.applied");
    flashSuccess(t("settings-page.server.saved"));
    setTimeout(() => {
      if (status?.textContent === t("settings-page.server.presets.applied")) {
        status.textContent = "";
      }
    }, 1800);
  });
  _renderPresetPreview();
};

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

const _bindRestartButton = (getToken: () => string | null): void => {
  const btn = document.getElementById(
    "settings-server-restart",
  ) as HTMLButtonElement | null;
  if (!btn) return;

  const label = btn.textContent;
  btn.addEventListener("click", async () => {
    const confirmed = await confirmModal({
      title: t("settings-page.server.restart-button"),
      message: t("settings-page.server.restart-confirm"),
    });
    if (!confirmed) return;
    btn.disabled = true;
    btn.textContent = t("settings-page.server.restarting");
    try {
      const res = await fetch(`${getBase()}/api/settings/restart`, {
        method: "POST",
        headers: authHeaders(getToken),
      });
      if (!res.ok) throw new Error(`Restart failed: ${res.status}`);
    } catch (err) {
      console.debug("[settings] restart trigger failed", err);
      btn.textContent = label;
      btn.disabled = false;
    }
  });
};

export async function initServerTab(
  getToken: () => string | null,
): Promise<void> {
  const container = document.getElementById("server-content");
  if (container) container.innerHTML = renderServerContent();

  _bindRestartButton(getToken);
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
    const controls = document.getElementById("settings-api-key-controls");
    const locked = document.getElementById("settings-api-key-locked");
    const toggles = document.getElementById("settings-api-key-toggles");
    if (apiKeyRes.ok) {
      const apiKeyData = (await apiKeyRes.json()) as {
        key: string;
        searchEnabled: boolean;
        suggestEnabled: boolean;
      };
      _apiKey = apiKeyData.key;
      _renderApiKey();
      if (controls) controls.style.display = "";
      if (toggles) toggles.style.display = "";
    } else if (apiKeyRes.status === 403) {
      if (locked) locked.hidden = false;
    }
  } catch (err) {
    console.warn("[settings] api key load failed", err);
  }

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
  _initPresetControls(getToken);

  document
    .getElementById("settings-degoog-indexer-enabled")
    ?.addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      setIndexerNavVisible(on);
    });
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
