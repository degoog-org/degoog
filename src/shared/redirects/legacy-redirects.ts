import { isDomainShaped } from "./redirect-match";
import type { RedirectRule } from "./redirect-rules";
import {
  SCHEME_PATTERN,
  escapeReplacement,
  hasRedirectToken,
} from "./redirect-target";

export const LEGACY_SEPARATOR = "->";

const LEGACY_URL_MARKERS = ["/", "?", "#", "{{"];

const _isLegacyUrlTarget = (target: string): boolean =>
  SCHEME_PATTERN.test(target) ||
  LEGACY_URL_MARKERS.some((marker) => target.includes(marker));

const _legacyMatch = (source: string): string => {
  const slashed = source.length > 2 && source.startsWith("/") && source.endsWith("/");
  if (!slashed) return source;
  const inner = source.slice(1, -1);
  return isDomainShaped(inner) ? source : inner;
};

const _legacyReplace = (target: string): string => {
  const escaped = escapeReplacement(target);
  if (!_isLegacyUrlTarget(target)) return escaped;
  if (SCHEME_PATTERN.test(target) || hasRedirectToken(target)) return escaped;
  return `https://${escaped}`;
};

export const isLegacyRedirectLine = (line: string): boolean =>
  !line.trim().startsWith("{") && line.includes(LEGACY_SEPARATOR);

export const parseLegacyRedirect = (line: string): RedirectRule | null => {
  const at = line.indexOf(LEGACY_SEPARATOR);
  if (at < 0) return null;
  const source = line.slice(0, at).trim();
  const target = line.slice(at + LEGACY_SEPARATOR.length).trim();
  if (!source || !target) return null;
  return { match: _legacyMatch(source), replace: _legacyReplace(target) };
};
