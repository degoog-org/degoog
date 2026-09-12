export enum DomainToken {
  URL = "{{url}}",
  HOSTNAME = "{{hostname}}",
  PATH = "{{path}}",
  QUERY = "{{query}}",
  HASH = "{{hash}}",
}

export const RULE_SEPARATOR = "->";

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const TEMPLATE_MARKERS = ["/", "?", "#", "{{"];

export const isUrlTarget = (target: string): boolean =>
  SCHEME_PATTERN.test(target) ||
  TEMPLATE_MARKERS.some((marker) => target.includes(marker));

const fillTokens = (template: string, source: URL): string =>
  template
    .replaceAll(DomainToken.URL, source.toString())
    .replaceAll(DomainToken.HOSTNAME, source.hostname)
    .replaceAll(DomainToken.PATH, source.pathname)
    .replaceAll(DomainToken.QUERY, source.search)
    .replaceAll(DomainToken.HASH, source.hash);

export const parseRule = (
  line: string,
): { source: string; target: string } | null => {
  const at = line.indexOf(RULE_SEPARATOR);
  if (at < 0) return null;
  const source = line.slice(0, at).trim();
  const target = line.slice(at + RULE_SEPARATOR.length).trim();
  if (!source || !target) return null;
  return { source, target };
};

export const resolveTarget = (
  originalUrl: string,
  target: string,
): string | null => {
  const wanted = target.trim();
  if (!wanted) return null;

  try {
    const source = new URL(originalUrl);

    if (!isUrlTarget(wanted)) {
      source.hostname = wanted;
      return source.toString();
    }

    const filled = fillTokens(wanted, source);
    const absolute = SCHEME_PATTERN.test(filled)
      ? filled
      : `${source.protocol}//${filled}`;
    return new URL(absolute).toString();
  } catch {
    return null;
  }
};
