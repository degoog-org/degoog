import { render } from "../../../shared/ui/tribute/dom";
import { normalizeRegion } from "../../../shared/region";
import { REGION_KEY } from "../../constants";
import { idbGet } from "../../utils/storage/db";
import { getRegistry } from "../../utils/search/engines";
import { RegionSelect, type RegionOption } from "./fields/region-select";
import { REGION_HOST_ID, REGION_SELECT_ID } from "./toggles";

const _regionNames = (): Intl.DisplayNames | null => {
  const locale = document.documentElement.lang;
  try {
    return new Intl.DisplayNames(locale ? [locale, "en"] : ["en"], { type: "region" });
  } catch (err) {
    console.debug("[settings] region names unavailable", err);
    return null;
  }
};

const _declaredRegions = async (): Promise<string[]> => {
  try {
    const { engines } = await getRegistry();
    return engines.flatMap((engine) => engine.regions ?? []);
  } catch (err) {
    console.warn("[settings] could not load engine regions", err);
    return [];
  }
};

const _regionOptions = (codes: readonly string[]): RegionOption[] => {
  const names = _regionNames();
  return [...new Set(codes.map(normalizeRegion).filter(Boolean))]
    .map((code) => ({ code, label: names?.of(code) ?? code }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

export const mountRegionSelect = async (): Promise<HTMLSelectElement | null> => {
  const host = document.getElementById(REGION_HOST_ID);
  if (!host) return null;
  const declared = await _declaredRegions();
  const saved = normalizeRegion(await idbGet<string>(REGION_KEY));
  if (declared.length === 0 && !saved) return null;
  render(<RegionSelect regions={_regionOptions([...declared, saved])} />, host);
  host.hidden = false;
  const select = document.getElementById(REGION_SELECT_ID) as HTMLSelectElement | null;
  if (select) select.value = saved;
  return select;
};
