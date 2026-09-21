import type { CompatCatalogItem } from "../../../types/compat-catalog";

const _host = (site: string | undefined): string => {
  if (!site) return "";
  try {
    return new URL(site).hostname;
  } catch {
    return "";
  }
};

export const CompatIcon = ({ item }: { item: CompatCatalogItem }): JSX.Element => {
  const letter = (item.name[0] ?? "?").toUpperCase();
  const host = _host(item.site);
  if (!host) {
    return (
      <span class="degoog-result--favicon result-favicon-fallback" aria-hidden="true">
        {letter}
      </span>
    );
  }
  return (
    <img
      class="degoog-result--favicon compat-favicon"
      alt=""
      loading="lazy"
      data-favicon-host={host}
      data-favicon-letter={letter}
    />
  );
};
