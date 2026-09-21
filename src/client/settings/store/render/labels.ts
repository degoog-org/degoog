export function pluginTypeLabel(type: string): string {
  if (type === "command") return "Bang";
  if (type === "slot") return "Slot";
  if (type === "search-result-tab") return "Search tab";
  if (type === "searchBarAction") return "Search bar";
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, " ");
}

export function engineTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
