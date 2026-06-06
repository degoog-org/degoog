import { getBase } from "../../utils/base-url";
import { authHeaders } from "../../utils/request";
import { getStoredToken } from "../../utils/settings-token";
import { saveField } from "../../utils/settings-api";
import { bindFieldSaveBtn, createFieldSaveBtn } from "../shared/field-save";
import { setIndexerNavVisible } from "./nav";

const _persistField = (key: string, value: string): Promise<boolean> =>
  saveField(key, value, getStoredToken);

export const wireToggles = async (
  refreshStats: () => Promise<void>,
): Promise<(isEnabled: boolean) => void> => {
  const res = await fetch(`${getBase()}/api/settings/general`, {
    headers: authHeaders(getStoredToken),
  });
  const settings = res.ok ? ((await res.json()) as Record<string, unknown>) : {};
  const enabled = settings.degoogIndexerEnabled === true || settings.degoogIndexerEnabled === "true";
  const publicExport =
    settings.degoogIndexerPublicExport === true ||
    settings.degoogIndexerPublicExport === "true";

  const publicEl = document.getElementById("indexer-public-export") as HTMLInputElement | null;
  const publicWrap = document.getElementById("indexer-public-wrap");
  const filtersWrap = document.getElementById("indexer-filters-wrap");
  const storageWrap = document.getElementById("indexer-storage-wrap");
  const statsWrap = document.getElementById("indexer-stats-wrap");
  const disabledNote = document.getElementById("indexer-disabled-note");
  const pruneEl = document.getElementById("indexer-prune-enabled") as HTMLInputElement | null;
  const fuzzyEl = document.getElementById("indexer-fuzzy-enabled") as HTMLInputElement | null;
  const maxPerSearchEl = document.getElementById("indexer-max-per-search") as HTMLInputElement | null;
  const maxUrlsEl = document.getElementById("indexer-max-urls") as HTMLInputElement | null;
  const maxHitsEl = document.getElementById("indexer-max-hits") as HTMLInputElement | null;
  const maxAgeDaysEl = document.getElementById("indexer-max-age-days") as HTMLInputElement | null;
  const queryLimitEl = document.getElementById("indexer-query-limit") as HTMLInputElement | null;
  const domainAllowEl = document.getElementById("indexer-domain-allowlist") as HTMLTextAreaElement | null;
  const domainBlockEl = document.getElementById("indexer-domain-blocklist") as HTMLTextAreaElement | null;
  const wordBlockEl = document.getElementById("indexer-word-blocklist") as HTMLTextAreaElement | null;

  const str = (key: string, fallback: string): string => {
    const v = settings[key];
    return typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
  };
  const bool = (key: string, fallback: boolean): boolean => {
    const v = settings[key];
    if (v === true || v === "true") return true;
    if (v === false || v === "false") return false;
    return fallback;
  };

  const applyVisibility = (isEnabled: boolean): void => {
    setIndexerNavVisible(isEnabled);
    if (filtersWrap) filtersWrap.hidden = !isEnabled;
    if (storageWrap) storageWrap.hidden = !isEnabled;
    if (statsWrap) statsWrap.hidden = !isEnabled;
    if (disabledNote) disabledNote.hidden = isEnabled;
    for (const wrap of [publicWrap, filtersWrap, storageWrap]) {
      wrap?.classList.toggle("degoog-fieldset--disabled", !isEnabled);
    }
    const disable = !isEnabled;
    for (const el of [
      publicEl,
      pruneEl,
      fuzzyEl,
      maxPerSearchEl,
      maxUrlsEl,
      maxHitsEl,
      maxAgeDaysEl,
      queryLimitEl,
      domainAllowEl,
      domainBlockEl,
      wordBlockEl,
    ]) {
      if (el) el.disabled = disable;
    }
  };

  if (publicEl) publicEl.checked = publicExport;
  if (pruneEl) pruneEl.checked = bool("degoogIndexerPruneEnabled", true);
  if (fuzzyEl) fuzzyEl.checked = bool("degoogIndexerFuzzyEnabled", true);
  if (maxPerSearchEl) maxPerSearchEl.value = str("degoogIndexerMaxPerSearch", "30");
  if (maxUrlsEl) maxUrlsEl.value = str("degoogIndexerMaxUrls", "0");
  if (maxHitsEl) maxHitsEl.value = str("degoogIndexerMaxHits", "0");
  if (maxAgeDaysEl) maxAgeDaysEl.value = str("degoogIndexerMaxAgeDays", "0");
  if (queryLimitEl) queryLimitEl.value = str("degoogIndexerQueryLimit", "100");
  if (domainAllowEl) domainAllowEl.value = str("degoogIndexerDomainAllowlist", "");
  if (domainBlockEl) domainBlockEl.value = str("degoogIndexerDomainBlocklist", "");
  if (wordBlockEl) wordBlockEl.value = str("degoogIndexerWordBlocklist", "");
  applyVisibility(enabled);
  if (enabled) await refreshStats();

  type FieldSpec = [HTMLInputElement | HTMLTextAreaElement | null, string, string];
  const fieldSpecs: FieldSpec[] = [
    [domainAllowEl, "degoogIndexerDomainAllowlist", ""],
    [domainBlockEl, "degoogIndexerDomainBlocklist", ""],
    [wordBlockEl, "degoogIndexerWordBlocklist", ""],
    [maxPerSearchEl, "degoogIndexerMaxPerSearch", "30"],
    [maxUrlsEl, "degoogIndexerMaxUrls", "0"],
    [maxHitsEl, "degoogIndexerMaxHits", "0"],
    [maxAgeDaysEl, "degoogIndexerMaxAgeDays", "0"],
    [queryLimitEl, "degoogIndexerQueryLimit", "100"],
  ];

  for (const [field, key, fallback] of fieldSpecs) {
    if (!field) continue;
    const btn = createFieldSaveBtn();
    field.insertAdjacentElement("afterend", btn);
    field.addEventListener("input", () => { btn.hidden = false; });
    bindFieldSaveBtn(btn, () => _persistField(key, field.value || fallback));
  }

  const wireToggle = (
    checkEl: HTMLInputElement | null,
    key: string,
  ): void => {
    checkEl?.addEventListener("change", () => {
      void _persistField(key, String(checkEl.checked));
    });
  };

  wireToggle(publicEl, "degoogIndexerPublicExport");
  wireToggle(pruneEl, "degoogIndexerPruneEnabled");
  wireToggle(fuzzyEl, "degoogIndexerFuzzyEnabled");

  return applyVisibility;
};
