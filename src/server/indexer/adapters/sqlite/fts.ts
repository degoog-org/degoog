import { canPrefix, splitTerms } from "../../shared/terms";

export const buildFtsQuery = (queryNorm: string): string =>
  splitTerms(queryNorm)
    .map((t) => (canPrefix(t) ? `"${t.token}"*` : `"${t.token}"`))
    .join(" AND ");

export const escapeLike = (s: string): string =>
  s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
