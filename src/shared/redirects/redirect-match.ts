import { SCHEME_PATTERN } from "./redirect-target";

export enum RedirectMatchKind {
  Domain = "domain",
  Regex = "regex",
}

export enum RedirectProblem {
  MissingMatch = "missing-match",
  MissingReplace = "missing-replace",
  InvalidRegex = "invalid-regex",
  SlowRegex = "slow-regex",
  TooLong = "too-long",
  BadTarget = "bad-target",
}

export type HostMatcher = (hostname: string) => RegExpMatchArray | null;

export type CompiledMatch =
  | { ok: true; kind: RedirectMatchKind; test: HostMatcher }
  | { ok: false; kind: RedirectMatchKind; problem: RedirectProblem; detail?: string };

export const MAX_PATTERN_LENGTH = 300;

const DOMAIN_SHAPE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.?$/i;
const REPEAT_AFTER_GROUP = /^(\*|\+|\{\d*,?\d*\})/;

const _isSlashed = (value: string): boolean =>
  value.length > 2 && value.startsWith("/") && value.endsWith("/");

const _stripUrl = (value: string): string => {
  if (!SCHEME_PATTERN.test(value)) return value;
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
};

export const normalizeHostname = (hostname: string): string =>
  hostname.toLowerCase().replace(/\.$/, "");

export const isDomainShaped = (value: string): boolean =>
  DOMAIN_SHAPE.test(value);

export const matchKindOf = (raw: string): RedirectMatchKind => {
  const value = _stripUrl(raw.trim());
  return !_isSlashed(value) && isDomainShaped(value)
    ? RedirectMatchKind.Domain
    : RedirectMatchKind.Regex;
};

export const toJsRegexSource = (source: string): string =>
  source
    .replace(/\(\?P</g, "(?<")
    .replace(/\(\?P=([A-Za-z_][A-Za-z0-9_]*)\)/g, "\\k<$1>");

export const isSlowPattern = (source: string): boolean => {
  const groups: { repeats: boolean; alternates: boolean }[] = [];
  let inClass = false;
  for (let at = 0; at < source.length; at++) {
    const char = source[at];
    if (char === "\\") {
      at++;
      continue;
    }
    if (inClass) {
      if (char === "]") inClass = false;
      continue;
    }
    if (char === "[") {
      inClass = true;
      continue;
    }
    if (char === "(") {
      groups.push({ repeats: false, alternates: false });
      continue;
    }
    const current = groups[groups.length - 1];
    if (char === "|" && current) {
      current.alternates = true;
      continue;
    }
    if (char === ")") {
      const closed = groups.pop();
      const repeated = REPEAT_AFTER_GROUP.test(source.slice(at + 1));
      if (closed && repeated && (closed.repeats || closed.alternates)) return true;
      const parent = groups[groups.length - 1];
      if (parent && (repeated || closed?.repeats)) parent.repeats = true;
      continue;
    }
    if ((char === "*" || char === "+" || char === "{") && current) {
      current.repeats = true;
    }
  }
  return false;
};

const _domainMatcher = (domain: string): HostMatcher => {
  const wanted = normalizeHostname(domain);
  return (hostname) => {
    const host = normalizeHostname(hostname);
    if (host !== wanted && !host.endsWith(`.${wanted}`)) return null;
    const found: RegExpMatchArray = [host];
    found.index = 0;
    found.input = host;
    return found;
  };
};

export const compileMatch = (raw: string): CompiledMatch => {
  const value = _stripUrl(raw.trim());
  const kind = matchKindOf(value);
  if (!value) {
    return { ok: false, kind, problem: RedirectProblem.MissingMatch };
  }
  if (kind === RedirectMatchKind.Domain) {
    return { ok: true, kind, test: _domainMatcher(value) };
  }
  const source = toJsRegexSource(_isSlashed(value) ? value.slice(1, -1) : value);
  if (source.length > MAX_PATTERN_LENGTH) {
    return { ok: false, kind, problem: RedirectProblem.TooLong };
  }
  if (isSlowPattern(source)) {
    return { ok: false, kind, problem: RedirectProblem.SlowRegex };
  }
  try {
    const pattern = new RegExp(source, "i");
    return {
      ok: true,
      kind,
      test: (hostname) => pattern.exec(normalizeHostname(hostname)),
    };
  } catch (err) {
    return {
      ok: false,
      kind,
      problem: RedirectProblem.InvalidRegex,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
};

export const toBareHost = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
