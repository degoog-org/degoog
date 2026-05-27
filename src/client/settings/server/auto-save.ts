import { getBase } from "../../utils/base-url";
import { jsonHeaders } from "../../utils/request";
import { boolStr, val } from "./fields";
import { getRateLimitPayload } from "./rate-limit";
import { serializeScoreRows } from "./domain-score";

const t = window.scopedT("core");

const TOGGLE_IDS = [
  "proxy-enabled",
  "image-proxy-allow-local",
  "languages-enabled",
  "rate-limit-enabled",
  "rate-limit-suggest-enabled",
  "streaming-enabled",
  "streaming-auto-retry",
  "domain-block-enabled",
  "domain-block-ui-enabled",
  "domain-replace-enabled",
  "domain-replace-ui-enabled",
  "domain-score-enabled",
  "domain-score-ui-enabled",
  "api-key-search-enabled",
  "api-key-suggest-enabled",
  "honeypot-enabled",
  "honeypot-css-check",
] as const;

const TEXT_FIELD_IDS = [
  "proxy-urls",
  "image-proxy-allow-list",
  "languages",
  "streaming-max-retries",
  "domain-block-list",
  "domain-replace-list",
  "custom-css",
  "honeypot-ban-duration",
] as const;

const RL_GROUP_IDS = [
  "rate-limit-options",
  "rate-limit-suggest-options",
] as const;

export const buildPayload = (): Record<string, string> => ({
  proxyEnabled: boolStr("proxy-enabled"),
  proxyUrls: val("proxy-urls"),
  imageProxyAllowLocal: boolStr("image-proxy-allow-local"),
  imageProxyAllowList: val("image-proxy-allow-list"),
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
  domainScoreList: serializeScoreRows(),
  domainScoreUiEnabled: boolStr("domain-score-ui-enabled"),
  customCss: val("custom-css"),
  apiKeySearchEnabled: boolStr("api-key-search-enabled"),
  apiKeySuggestEnabled: boolStr("api-key-suggest-enabled"),
  honeypotEnabled: boolStr("honeypot-enabled"),
  honeypotCssCheck: boolStr("honeypot-css-check"),
  honeypotBanDuration: val("honeypot-ban-duration"),
});

export const saveGeneral = async (getToken: () => string | null): Promise<void> => {
  const res = await fetch(`${getBase()}/api/settings/general`, {
    method: "POST",
    headers: jsonHeaders(getToken),
    body: JSON.stringify(buildPayload()),
  });
  if (!res.ok) throw new Error("save failed");
};

const _clearDirtyBtns = (): void => {
  document
    .querySelectorAll<HTMLButtonElement>(".settings-field-save-btn")
    .forEach((btn) => {
      btn.hidden = true;
    });
};

export const bindToggleAutoSave = (getToken: () => string | null): void => {
  for (const id of TOGGLE_IDS) {
    const el = document.getElementById(`settings-${id}`) as HTMLInputElement | null;
    if (!el) continue;
    el.addEventListener("change", () => {
      _clearDirtyBtns();
      void saveGeneral(getToken);
    });
  }
};

const _mkSaveBtn = (): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "settings-field-save-btn";
  btn.hidden = true;
  btn.textContent = t("settings-page.actions.save");
  return btn;
};

const _bindSaveBtn = (btn: HTMLButtonElement, getToken: () => string | null): void => {
  btn.addEventListener("click", async () => {
    const prev = btn.textContent ?? "";
    btn.disabled = true;
    try {
      await saveGeneral(getToken);
      btn.textContent = t("settings-page.server.saved");
      setTimeout(() => {
        btn.hidden = true;
        btn.textContent = prev;
        btn.disabled = false;
      }, 1200);
    } catch {
      btn.textContent = t("settings-page.server.save-failed-network");
      btn.disabled = false;
      setTimeout(() => {
        btn.textContent = prev;
      }, 1500);
    }
  });
};

export const injectFieldSaveBtns = (getToken: () => string | null): void => {
  for (const id of TEXT_FIELD_IDS) {
    const field = document.getElementById(`settings-${id}`);
    if (!field) continue;
    const btn = _mkSaveBtn();
    field.insertAdjacentElement("afterend", btn);
    field.addEventListener("input", () => {
      btn.hidden = false;
    });
    _bindSaveBtn(btn, getToken);
  }

  for (const groupId of RL_GROUP_IDS) {
    const group = document.getElementById(`settings-${groupId}`);
    if (!group) continue;
    const btn = _mkSaveBtn();
    group.appendChild(btn);
    group.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach((input) => {
      input.addEventListener("input", () => {
        btn.hidden = false;
      });
    });
    _bindSaveBtn(btn, getToken);
  }
};
