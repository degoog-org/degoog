import { normalizeRepoUrl } from "./repo-url";
import type { StoreItem } from "../../../types/store-tab";

export function filterItems(
  items: StoreItem[],
  typeFilter: string,
  subtypeFilter: string,
  searchQuery: string,
  repoFilter: string | null,
  installedFilter: string,
): StoreItem[] {
  let out = items;
  if (repoFilter) {
    const norm = normalizeRepoUrl(repoFilter);
    out = out.filter((i) => normalizeRepoUrl(i.repoUrl) === norm);
  }
  if (typeFilter && typeFilter !== "all") {
    out = out.filter((i) => i.type === typeFilter);
  }
  if (subtypeFilter && subtypeFilter !== "all") {
    out = out.filter((i) => {
      if (i.type === "plugin") return i.pluginType === subtypeFilter;
      if (i.type === "engine") {
        const types = i.engineTypes ?? (i.engineType ? [i.engineType] : []);
        return types.includes(subtypeFilter);
      }
      return true;
    });
  }
  if (installedFilter === "installed") {
    out = out.filter((i) => i.installed);
  } else if (installedFilter === "not-installed") {
    out = out.filter((i) => !i.installed);
  }
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    out = out.filter(
      (i) =>
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.description && i.description.toLowerCase().includes(q)) ||
        (i.repoName && i.repoName.toLowerCase().includes(q)) ||
        (i.author?.name && i.author.name.toLowerCase().includes(q)),
    );
  }
  return out;
}

export function collectSubtypes(
  items: StoreItem[],
  typeFilter: string,
): string[] {
  if (typeFilter === "plugin") {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.type === "plugin" && i.pluginType) set.add(i.pluginType);
    });
    return Array.from(set).sort();
  }
  if (typeFilter === "engine") {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.type !== "engine") return;
      for (const engineType of i.engineTypes ??
        (i.engineType ? [i.engineType] : [])) {
        set.add(engineType);
      }
    });
    return Array.from(set).sort();
  }
  return [];
}
