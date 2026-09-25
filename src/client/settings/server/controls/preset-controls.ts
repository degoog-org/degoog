import { saveBatch } from "../../../utils/settings/settings-api";
import type { ServerSettingsData } from "../../../types/settings-server";
import { flashError, flashSuccess } from "../../shared/flash-msg";
import { el } from "../fields";
import {
  PRESET_FIELD_DOM_IDS,
  PRESET_TOGGLE_KEYS,
  SERVER_SETTINGS_PRESETS,
  type ServerPresetValueKey,
  type ServerPresetValues,
  type ServerSettingsPreset,
} from "../presets";
import { syncDependentPanels } from "./toggle-wraps";

const t = window.scopedT("core");

let _currentServerSettings: ServerSettingsData = {};

export const setCurrentServerSettings = (settings: ServerSettingsData): void => {
  _currentServerSettings = settings;
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
  const warningsBlock = document.getElementById(
    "settings-server-preset-warnings",
  );
  const warningList = document.getElementById(
    "settings-server-preset-warning-list",
  );
  const changeList = document.getElementById(
    "settings-server-preset-change-list",
  );
  const status = document.getElementById("settings-server-preset-status");
  const apply = document.getElementById(
    "settings-server-preset-apply",
  ) as HTMLButtonElement | null;
  const preset = select ? _findPreset(select.value) : undefined;
  if (
    !preset ||
    !preview ||
    !desc ||
    !warningList ||
    !changeList ||
    !warningsBlock
  ) {
    if (preview) preview.hidden = true;
    return;
  }

  preview.hidden = false;
  desc.textContent = t(preset.descriptionKey);
  if (status) status.textContent = "";
  _renderListItems(
    warningList,
    preset.warnings.map((key) => t(key)),
  );
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
  syncDependentPanels();
};

export const initPresetControls = (getToken: () => string | null): void => {
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
      if (status)
        status.textContent = t("settings-page.server.presets.apply-failed");
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
