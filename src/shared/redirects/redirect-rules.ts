import { parseLegacyRedirect } from "./legacy-redirects";
import {
  RedirectProblem,
  compileMatch,
  type CompiledMatch,
  type HostMatcher,
  type RedirectMatchKind,
} from "./redirect-match";
import { expandReplacement, resolveRedirectTarget } from "./redirect-target";

export interface RedirectRule {
  match: string;
  replace: string;
}

export interface CompiledRedirect {
  kind: RedirectMatchKind;
  test: HostMatcher;
  replace: string;
}

export type RedirectCheck =
  | { ok: true; kind: RedirectMatchKind; compiled: CompiledRedirect }
  | { ok: false; kind: RedirectMatchKind; problem: RedirectProblem; detail?: string };

export interface RedirectListParse {
  rules: RedirectRule[];
  legacy: number;
  unreadable: string[];
}

export interface RedirectHit {
  url: string;
  index: number;
}

const _isRule = (value: unknown): value is RedirectRule =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as RedirectRule).match === "string" &&
  typeof (value as RedirectRule).replace === "string";

const _parseJsonRule = (line: string): RedirectRule | null => {
  try {
    const parsed: unknown = JSON.parse(line);
    return _isRule(parsed) ? { match: parsed.match, replace: parsed.replace } : null;
  } catch {
    return null;
  }
};

export const parseRedirectList = (raw: string): RedirectListParse => {
  const out: RedirectListParse = { rules: [], legacy: 0, unreadable: [] };
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const modern = trimmed.startsWith("{") ? _parseJsonRule(trimmed) : null;
    const rule = modern ?? parseLegacyRedirect(trimmed);
    if (!rule) {
      out.unreadable.push(trimmed);
      continue;
    }
    if (!modern) out.legacy++;
    out.rules.push(rule);
  }
  return out;
};

export const toRedirectLine = (rule: RedirectRule): string =>
  JSON.stringify({ match: rule.match.trim(), replace: rule.replace.trim() });

export const serializeRedirectRules = (rules: RedirectRule[]): string =>
  rules
    .filter((rule) => rule.match.trim() && rule.replace.trim())
    .map(toRedirectLine)
    .join("\n");

export const checkRedirectRule = (rule: RedirectRule): RedirectCheck => {
  const matched: CompiledMatch = compileMatch(rule.match);
  if (!matched.ok) return matched;
  const replace = rule.replace.trim();
  if (!replace) {
    return { ok: false, kind: matched.kind, problem: RedirectProblem.MissingReplace };
  }
  if (!resolveRedirectTarget(new URL("https://example.com/"), replace.replace(/[$\\]/g, ""))) {
    return { ok: false, kind: matched.kind, problem: RedirectProblem.BadTarget };
  }
  return {
    ok: true,
    kind: matched.kind,
    compiled: { kind: matched.kind, test: matched.test, replace },
  };
};

export const applyRedirect = (
  url: string,
  rules: readonly CompiledRedirect[],
): RedirectHit | null => {
  let source: URL;
  try {
    source = new URL(url);
  } catch {
    return null;
  }
  for (let index = 0; index < rules.length; index++) {
    const rule = rules[index];
    const found = rule.test(source.hostname);
    if (!found) continue;
    const resolved = resolveRedirectTarget(source, expandReplacement(rule.replace, found));
    return resolved ? { url: resolved, index } : null;
  }
  return null;
};
