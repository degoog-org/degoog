import { saveField, saveBatch } from "../../utils/settings-api";
import { bindFieldSaveBtn, createFieldSaveBtn } from "../shared/field-save";
import { flashError, flashSuccess } from "../shared/flash-msg";
import { boolStr, el } from "./fields";
import { serializeScoreRows } from "./domain-score";

const TOGGLE_KEYS = [
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
  "degoog-indexer-enabled",
] as const;

const RL_SEARCH_KEYS = [
  "rateLimitBurstWindow",
  "rateLimitBurstMax",
  "rateLimitLongWindow",
  "rateLimitLongMax",
] as const;

const RL_SUGGEST_KEYS = [
  "rateLimitSuggestBurstWindow",
  "rateLimitSuggestBurstMax",
  "rateLimitSuggestLongWindow",
  "rateLimitSuggestLongMax",
  "acDebounceMs",
] as const;

const _toCamel = (s: string): string =>
  s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

const ENGINE_VISIBILITY_KEYS = new Set(["degoog-indexer-enabled"]);

export const bindToggleAutoSave = (getToken: () => string | null): void => {
  for (const id of TOGGLE_KEYS) {
    const input = document.getElementById(`settings-${id}`) as HTMLInputElement | null;
    if (!input) continue;
    const key = _toCamel(id);
    input.addEventListener("change", async () => {
      const prev = input.checked;
      try {
        const ok = await saveField(key, boolStr(id), getToken);
        if (!ok) {
          console.error("[auto-save] toggle save failed", { key });
          input.checked = !prev;
          flashError(window.scopedT("core")("settings-page.server.save-failed-network"));
          return;
        }
        flashSuccess(window.scopedT("core")("settings-page.server.saved"));
        if (ENGINE_VISIBILITY_KEYS.has(id)) {
          window.dispatchEvent(new Event("extensions-saved"));
        }
      } catch (err) {
        console.error("[auto-save] toggle save error", { key, err });
        input.checked = !prev;
        flashError(window.scopedT("core")("settings-page.server.save-failed-network"));
      }
    });
  }
};

const _rlPayload = (
  keys: readonly string[],
): Record<string, string> => {
  const payload: Record<string, string> = {};
  for (const key of keys) {
    const domId = key.replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`);
    const input = el(domId);
    payload[key] = input?.value.trim() || input?.placeholder || "";
  }
  return payload;
};

export const injectFieldSaveBtns = (getToken: () => string | null): void => {
  const fields = document.querySelectorAll<HTMLElement>("[data-save-key]");
  for (const field of fields) {
    const key = field.dataset.saveKey;
    if (!key) continue;
    const btn = createFieldSaveBtn();
    field.insertAdjacentElement("afterend", btn);
    field.addEventListener("input", () => { btn.hidden = false; });
    if (field instanceof HTMLInputElement && field.type === "number") {
      field.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); btn.click(); }
      });
    }
    bindFieldSaveBtn(btn, () => saveField(key, (field as HTMLInputElement).value, getToken));
  }

  const rlSearchGroup = document.getElementById("settings-rate-limit-options");
  if (rlSearchGroup) {
    const btn = createFieldSaveBtn();
    rlSearchGroup.appendChild(btn);
    rlSearchGroup.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach((input) => {
      input.addEventListener("input", () => { btn.hidden = false; });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); btn.click(); }
      });
    });
    bindFieldSaveBtn(btn, () => saveBatch(_rlPayload(RL_SEARCH_KEYS), getToken));
  }

  const rlSuggestGroup = document.getElementById("settings-rate-limit-suggest-options");
  if (rlSuggestGroup) {
    const btn = createFieldSaveBtn();
    rlSuggestGroup.appendChild(btn);
    rlSuggestGroup.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach((input) => {
      input.addEventListener("input", () => { btn.hidden = false; });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); btn.click(); }
      });
    });
    bindFieldSaveBtn(btn, () => saveBatch(_rlPayload(RL_SUGGEST_KEYS), getToken));
  }

  const scoreSection = document.getElementById("settings-domain-score-rows");
  if (scoreSection) {
    const btn = createFieldSaveBtn();
    scoreSection.insertAdjacentElement("afterend", btn);
    const markDirty = (): void => { btn.hidden = false; };
    new MutationObserver(markDirty).observe(scoreSection, { childList: true, subtree: true });
    document.getElementById("settings-domain-score-add")?.addEventListener("click", markDirty);
    bindFieldSaveBtn(btn, () => saveField("domainScoreList", serializeScoreRows(), getToken));
  }
};
