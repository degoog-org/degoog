import { getBasePath } from "./base-url";

export const normalizePath = (p: string): string => {
  const s = p.trim().replace(/^\/+/, "").replace(/\/+$/, "") || "";
  return s ? `/${s}` : "/";
};

export const routeSuffix = (path: string, prefix: string): string => {
  const base = getBasePath();
  const full = `${base && !base.startsWith("/") ? `/${base}` : base}${prefix}`;
  return path.startsWith(full) ? path.slice(full.length) || "/" : "/";
};
