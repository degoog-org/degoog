import { applyRedirect, checkRedirectRule, type RedirectRule } from "./redirect-rules";
import { SCHEME_PATTERN, escapeReplacement } from "./redirect-target";

export enum SubdomainPlace {
  None = "none",
  Path = "path",
  Host = "host",
}

export interface RedirectExample {
  before: URL;
  after: URL;
  site: string;
  subdomain: string;
  place: SubdomainPlace;
  keepRest: boolean;
  allSubdomains: boolean;
  prefix: string[];
  hostTail: string;
}

export interface RedirectChoices {
  allSubdomains: boolean;
  keepRest: boolean;
}

const KEEP_REST = "{{path}}{{query}}{{hash}}";
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu", "ne", "or"]);
const SAMPLE_SUBDOMAINS = ["tennis", "bowling"];
const SAMPLE_PATHS = ["/serve", "/strike"];

const _escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

export const toLink = (raw: string): URL | null => {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(SCHEME_PATTERN.test(value) ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
};

const _splitHost = (hostname: string): { site: string; subdomain: string } => {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  const tld = labels[labels.length - 1];
  const second = labels[labels.length - 2] ?? "";
  const baseCount = labels.length >= 3 && tld.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;
  const base = labels.splice(labels.length - baseCount);
  if (labels[0] === "www") labels.shift();
  return { site: base.join("."), subdomain: labels.join(".") };
};

const _trimSlash = (path: string): string => path.replace(/\/+$/, "");

const _carriesRest = (before: URL, after: URL): boolean => {
  const sourcePath = _trimSlash(before.pathname);
  const pathCarried = !sourcePath || _trimSlash(after.pathname).endsWith(sourcePath);
  return pathCarried && (!before.search || after.search === before.search);
};

export const inferRedirect = (rawBefore: string, rawAfter: string): RedirectExample | null => {
  const before = toLink(rawBefore);
  const after = toLink(rawAfter);
  if (!before || !after) return null;
  const { site, subdomain } = _splitHost(before.hostname);
  const keepRest = _carriesRest(before, after);
  const afterPath = _trimSlash(after.pathname);
  const sourcePath = _trimSlash(before.pathname);
  const prefixPath = keepRest && sourcePath ? afterPath.slice(0, afterPath.length - sourcePath.length) : afterPath;
  const prefix = prefixPath.split("/").filter(Boolean);
  const afterHost = after.host.toLowerCase();
  let place = SubdomainPlace.None;
  let hostTail = afterHost;
  if (subdomain && afterHost.startsWith(`${subdomain}.`) && afterHost !== before.host.toLowerCase()) {
    place = SubdomainPlace.Host;
    hostTail = afterHost.slice(subdomain.length + 1);
  } else if (subdomain && prefix.includes(subdomain)) {
    place = SubdomainPlace.Path;
  }
  return { before, after, site, subdomain, place, keepRest, allSubdomains: true, prefix, hostTail };
};

export const inferredChoices = (example: RedirectExample): RedirectChoices => ({
  allSubdomains: example.allSubdomains,
  keepRest: example.keepRest,
});

const _captures = (example: RedirectExample, choices: RedirectChoices): boolean =>
  choices.allSubdomains && example.place !== SubdomainPlace.None;

const _buildMatch = (example: RedirectExample, choices: RedirectChoices): string => {
  const site = _escapeRegex(example.site);
  if (!choices.allSubdomains) {
    return example.subdomain
      ? `^${_escapeRegex(example.subdomain)}\\.${site}$`
      : `^(?:www\\.)?${site}$`;
  }
  if (example.place === SubdomainPlace.Host) return `^(.+)\\.${site}$`;
  if (example.place === SubdomainPlace.Path) return `^(?:www\\.)?(?:(.+)\\.)?${site}$`;
  return example.site;
};

const _buildReplace = (example: RedirectExample, choices: RedirectChoices): string => {
  const capture = _captures(example, choices);
  const sub = capture ? "$1" : escapeReplacement(example.subdomain);
  const host =
    example.place === SubdomainPlace.Host
      ? `${sub}.${escapeReplacement(example.hostTail)}`
      : escapeReplacement(example.after.host.toLowerCase());
  const path = example.prefix
    .map((segment) => (example.place === SubdomainPlace.Path && segment === example.subdomain ? sub : escapeReplacement(segment)))
    .join("/");
  const body = path ? `${host}/${path}` : host;
  const https = example.after.protocol === "https:";
  if (!choices.keepRest) {
    const tail = path ? "" : "/";
    return `${example.after.protocol}//${body}${tail}${escapeReplacement(example.after.search + example.after.hash)}`;
  }
  return https ? body : `${example.after.protocol}//${body}${KEEP_REST}`;
};

export const buildExampleRule = (example: RedirectExample, choices: RedirectChoices): RedirectRule => ({
  match: _buildMatch(example, choices),
  replace: _buildReplace(example, choices),
});

const _other = (options: string[], avoid: string): string =>
  options.find((option) => option !== avoid) ?? options[0];

export const sampleLink = (example: RedirectExample, choices: RedirectChoices): string | null => {
  if (!choices.allSubdomains) return null;
  const sub = _other(SAMPLE_SUBDOMAINS, example.subdomain);
  const path = _other(SAMPLE_PATHS, example.before.pathname);
  return `${example.before.protocol}//${sub}.${example.site}${path}`;
};

export const runRule = (rule: RedirectRule, link: string): string | null => {
  const check = checkRedirectRule(rule);
  return check.ok ? (applyRedirect(link, [check.compiled])?.url ?? null) : null;
};

export const reproducesExample = (example: RedirectExample): boolean =>
  runRule(buildExampleRule(example, inferredChoices(example)), example.before.toString()) ===
  example.after.toString();
