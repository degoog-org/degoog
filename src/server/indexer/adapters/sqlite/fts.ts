import { canPrefix, splitTerms } from "../../shared/terms";

const quoteFts = (token: string): string => `"${token.replace(/"/g, '""')}"`;

export const buildFtsQuery = (queryNorm: string): string =>
  splitTerms(queryNorm)
    .map((t) => (canPrefix(t) ? `${quoteFts(t.token)}*` : quoteFts(t.token)))
    .join(" AND ");
