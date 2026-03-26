import type { TimeFilter } from "../types";

const TBS_MAP: Record<string, string> = {
  hour: "qdr:h",
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
};

export const resolveGoogleTbs = (timeFilter?: TimeFilter): string | null => {
  if (!timeFilter || timeFilter === "any" || timeFilter === "custom") return null;
  return TBS_MAP[timeFilter] ?? null;
};

export const resolveGoogleCustomDateTbs = (dateFrom?: string, dateTo?: string): string | null => {
  if (!dateFrom && !dateTo) return null;
  const parts = ["cdr:1"];
  if (dateFrom) {
    const d = new Date(dateFrom);
    if (!isNaN(d.getTime())) parts.push(`cd_min:${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`);
  }
  if (dateTo) {
    const d = new Date(dateTo);
    if (!isNaN(d.getTime())) parts.push(`cd_max:${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`);
  }
  return parts.length > 1 ? parts.join(",") : null;
};

export const resolveGoogleHref = (href: string): string => {
  if (!href.startsWith("/url?")) return href;
  try {
    const parsed = new URL(href, "https://www.google.com");
    return parsed.searchParams.get("q") || parsed.searchParams.get("url") || href;
  } catch {
    return href;
  }
};
