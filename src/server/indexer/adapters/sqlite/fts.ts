export const safeFtsTerm = (s: string): string =>
  s.replace(/[^a-z0-9\-]/g, "").trim();

export const buildFtsQuery = (queryNorm: string): string => {
  const terms = queryNorm
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map(safeFtsTerm)
    .filter(Boolean);
  return terms.length > 0 ? terms.map((t) => `${t}*`).join(" AND ") : "";
};

export const escapeLike = (s: string): string =>
  s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
