import { WEB_TYPE } from "./copy";
import { typeLabel } from "../type-label";
import type { CompatCatalogGroup } from "../../../types/compat-catalog";
import type { CompatCatalogItem } from "../../../../shared/compat-layers";

export const compatFilter = (
  items: CompatCatalogItem[],
  query: string,
): CompatCatalogItem[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(needle) ||
      item.code.toLowerCase().includes(needle),
  );
};

export const compatGroups = (items: CompatCatalogItem[]): CompatCatalogGroup[] => {
  const map = new Map<string, CompatCatalogItem[]>();
  for (const item of items) {
    const key = (item.types[0] ?? WEB_TYPE).toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return [...map.keys()]
    .sort((a, b) => {
      if (a === WEB_TYPE) return -1;
      if (b === WEB_TYPE) return 1;
      return a.localeCompare(b);
    })
    .map((key) => ({
      key,
      label: typeLabel(key),
      items: (map.get(key) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }));
};

export const compatPackages = (item: CompatCatalogItem): string[] =>
  item.runtime.filter((need) => need.missing).map((need) => need.package);
