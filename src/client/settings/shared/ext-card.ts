import { escapeHtml, getConfigStatus } from "../../utils/dom";
import type { ExtensionMeta } from "../../types";

const t = window.scopedT("core");

export const extCardBadge = (ext: ExtensionMeta): string => {
  const status = ext.configurable ? getConfigStatus(ext) : null;
  if (status === "configured") {
    return '<span class="ext-configured-badge" data-tooltip="' + escapeHtml(t("settings-page.extensions.status-configured")) + '"></span>';
  }
  if (status === "needs-config") {
    return '<span class="ext-needs-config-badge" data-tooltip="' + escapeHtml(t("settings-page.extensions.status-needs-config")) + '"></span>';
  }
  return "";
};

export const extCardConfigureBtn = (ext: ExtensionMeta): string =>
  ext.configurable
    ? `<button class="ext-card-configure btn btn--secondary degoog-btn degoog-btn--secondary" data-id="${escapeHtml(ext.id)}" type="button">${escapeHtml(t("settings-page.extensions.configure"))}</button>`
    : "";

export const extCardVersionWarning = (ext: ExtensionMeta): string =>
  ext.requiresNewerVersion
    ? `<span class="ext-version-warning">${escapeHtml(t("settings-page.extensions.requires-newer-version"))}</span>`
    : "";

export const extCardRestartWarning = (ext: ExtensionMeta): string =>
  ext.needsAppRestart
    ? `<span class="degoog-badge degoog-badge--restart-required" data-tooltip="${escapeHtml(t("settings-page.extensions.restart-required"))}"><i class="fa-solid fa-triangle-exclamation"></i></span>`
    : "";
