import { lookup } from "dns/promises";
import { isIP } from "net";
import { logger } from "./logger";

const RESERVED_IPV4 = new RegExp(
  [
    "^0\\.",
    "^10\\.",
    "^127\\.",
    "^169\\.254\\.",
    "^172\\.(?:1[6-9]|2\\d|3[01])\\.",
    "^192\\.168\\.",
    "^100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.",
    "^(?:22[4-9]|2[3-5]\\d)\\.",
  ].join("|"),
);

const RESERVED_IPV6 = /^(?:::1|::|fe80|f[cd]|ff)/i;
const MAPPED_IPV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

const strip = (host: string): string => host.replace(/^\[|\]$/g, "");

export const isBlockedIp = (host: string): boolean => {
  const ip = strip(host).toLowerCase();
  const mapped = ip.match(MAPPED_IPV4);
  if (mapped) return RESERVED_IPV4.test(mapped[1]);
  if (isIP(ip) === 6) return RESERVED_IPV6.test(ip);
  return RESERVED_IPV4.test(ip);
};

export interface LocalImageAccess {
  enabled: boolean;
  patterns: string[];
}

type Matcher = (value: string) => boolean;

let cacheKey = "";
let cacheMatchers: Matcher[] = [];

const literalIp = (ip: string): Matcher => {
  const target = ip.toLowerCase();
  return (value) => strip(value).toLowerCase() === target;
};

const compile = (patterns: string[]): Matcher[] => {
  const key = patterns.join("\n");
  if (key === cacheKey) return cacheMatchers;
  const out: Matcher[] = [];
  for (const raw of patterns) {
    const pattern = raw.trim();
    if (!pattern) continue;
    if (isIP(strip(pattern))) {
      out.push(literalIp(strip(pattern)));
      continue;
    }
    try {
      const re = new RegExp(pattern);
      out.push((value) => re.test(value));
    } catch (err) {
      logger.warn("proxy", `ignoring invalid image allow-list pattern "${pattern}"`, err);
    }
  }
  cacheKey = key;
  cacheMatchers = out;
  return out;
};

const onAllowList = (
  candidates: string[],
  access: LocalImageAccess | undefined,
): boolean => {
  if (!access?.enabled) return false;
  const matchers = compile(access.patterns);
  if (matchers.length === 0) return true;
  return candidates.some((c) => matchers.some((match) => match(c)));
};

const warned = new Set<string>();

const youShallNotPass = (host: string): void => {
  if (warned.has(host)) return;
  warned.add(host);
  logger.warn(
    "proxy",
    `blocked image proxy to local/reserved host "${host}". This is usually a self-hosted or LAN source but it COULD be a malicious source. Enable "Allow local network images" under Server settings > Proxy to permit it - at your own risk.`,
  );
};

/**
 * Best-effort SSRF guard for a single URL. IP literals are checked
 * synchronously; hostnames are resolved and every returned address is
 * checked. A DNS rebinding race remains possible between this check and
 * the actual fetch, which is an accepted limitation for the signed proxy.
 *
 * `access` opts a self-hosted instance into proxying images from its own
 * network: when enabled with no patterns every local host is allowed,
 * otherwise the host and its resolved addresses must match a pattern.
 */
export const isSafeHost = async (
  host: string,
  access?: LocalImageAccess,
): Promise<boolean> => {
  const bare = strip(host);
  if (isIP(bare)) {
    if (!isBlockedIp(bare)) return true;
    if (onAllowList([bare, host], access)) return true;
    youShallNotPass(host);
    return false;
  }
  try {
    const records = await lookup(host, { all: true });
    const addresses = records.map((r) => r.address);
    if (!addresses.some((a) => isBlockedIp(a))) return true;
    if (onAllowList([host, ...addresses], access)) return true;
    youShallNotPass(host);
    return false;
  } catch (err) {
    logger.debug("proxy", `DNS lookup failed for ${host}`, err);
    return true;
  }
};
