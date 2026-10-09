const t = window.scopedT("core");

const KEY_PREFIX = "settings-page.store.";
const LIST_MAX = 3;
const MINUTE_S = 60;
const HOUR_S = 3600;
const DAY_S = 86400;

export const st = (key: string, vars?: Record<string, string>): string =>
  t(`${KEY_PREFIX}${key}`, vars);

export const counted = (
  key: string,
  count: number,
  vars: Record<string, string> = {},
): string =>
  st(`${key}-${count === 1 ? "one" : "many"}`, {
    ...vars,
    count: count.toLocaleString(),
  });

export const listNames = (names: string[], max = LIST_MAX): string => {
  if (names.length <= 1) return names.join("");
  if (names.length <= max)
    return st("list-and", {
      list: names.slice(0, -1).join(", "),
      last: names[names.length - 1],
    });
  return st("list-more", {
    list: names.slice(0, max).join(", "),
    count: String(names.length - max),
  });
};

export const ago = (iso: string): string => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s) || s < MINUTE_S) return st("time-just-now");
  if (s < HOUR_S) return st("time-min-ago", { n: String(Math.floor(s / MINUTE_S)) });
  if (s < DAY_S) return counted("time-hours-ago", Math.floor(s / HOUR_S));
  return counted("time-days-ago", Math.floor(s / DAY_S));
};
