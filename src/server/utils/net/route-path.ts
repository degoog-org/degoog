export const normalizePath = (p: string): string => {
  const s = p.trim().replace(/^\/+/, "").replace(/\/+$/, "") || "";
  return s ? `/${s}` : "/";
};
