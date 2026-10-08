export enum RedirectToken {
  URL = "{{url}}",
  HOSTNAME = "{{hostname}}",
  PATH = "{{path}}",
  QUERY = "{{query}}",
  HASH = "{{hash}}",
}

export const REDIRECT_TOKENS: readonly string[] = Object.values(RedirectToken);

export const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const GROUP_REFERENCE =
  /\$\$|\$&|\$<([^>]+)>|\$(\d{1,2})|\\g<([^>]+)>|\\(\d)|\\\\/g;

const _numberedGroup = (match: RegExpMatchArray, digits: string): string => {
  const index = Number(digits);
  if (index < match.length) return match[index] ?? "";
  if (digits.length === 2 && Number(digits[0]) < match.length) {
    return `${match[Number(digits[0])] ?? ""}${digits[1]}`;
  }
  return "";
};

const _group = (match: RegExpMatchArray, ref: string): string =>
  /^\d+$/.test(ref) ? _numberedGroup(match, ref) : (match.groups?.[ref] ?? "");

export const expandReplacement = (
  template: string,
  match: RegExpMatchArray,
): string =>
  template.replace(
    GROUP_REFERENCE,
    (whole, dollarName?: string, dollarDigits?: string, pyRef?: string, slashDigit?: string) => {
      if (whole === "$$") return "$";
      if (whole === "\\\\") return "\\";
      if (whole === "$&") return match[0] ?? "";
      const ref = dollarName ?? dollarDigits ?? pyRef ?? slashDigit ?? "";
      return _group(match, ref);
    },
  );

export const escapeReplacement = (literal: string): string =>
  literal.replace(/\\/g, "\\\\").replace(/\$/g, "$$$$");

export const hasRedirectToken = (value: string): boolean =>
  REDIRECT_TOKENS.some((token) => value.includes(token));

const TOKEN_PATTERN = /(\/?)\{\{(url|hostname|path|query|hash)\}\}/g;

const _tokenValue = (name: string, source: URL): string => {
  if (name === "url") return source.toString();
  if (name === "hostname") return source.hostname;
  if (name === "path") return source.pathname;
  if (name === "query") return source.search;
  return source.hash;
};

const _fillTokens = (template: string, source: URL): string =>
  template.replace(TOKEN_PATTERN, (_whole, slash: string, name: string) =>
    name === "path" ? source.pathname : `${slash}${_tokenValue(name, source)}`,
  );

const _safeUrl = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    if (!ALLOWED_PROTOCOLS.has(url.protocol) || !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
};

const _appendOriginal = (source: URL, base: string): string | null => {
  let target: URL;
  try {
    target = new URL(`${source.protocol}//${base}`);
  } catch {
    return null;
  }
  if (!target.hostname) return null;
  const prefix = target.pathname.replace(/\/+$/, "");
  target.pathname = `${prefix}${source.pathname}`;
  if (source.search) {
    target.search = target.search
      ? `${target.search}&${source.search.slice(1)}`
      : source.search;
  }
  if (!target.hash && source.hash) target.hash = source.hash;
  return _safeUrl(target.toString());
};

export const resolveRedirectTarget = (
  source: URL,
  replacement: string,
): string | null => {
  const wanted = replacement.trim().replace(/^\/\//, "");
  if (!wanted || wanted.startsWith("/")) return null;

  if (hasRedirectToken(wanted)) {
    const filled = _fillTokens(wanted, source);
    return _safeUrl(
      SCHEME_PATTERN.test(filled) ? filled : `${source.protocol}//${filled}`,
    );
  }
  if (SCHEME_PATTERN.test(wanted)) return _safeUrl(wanted);
  return _appendOriginal(source, wanted);
};
