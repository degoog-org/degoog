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

const V6_GROUPS = 8;
const MAPPED_V4 = 0xffff;
const NAT64_HI = 0x0064;
const NAT64_LO = 0xff9b;
const SIX_TO_FOUR = 0x2002;
const TEREDO_HI = 0x2001;
const TEREDO_FLIP = 0xffff;

const strip = (host: string): string => host.replace(/^\[|\]$/g, "");

const quadToPair = (quad: string): number[] => {
  const [a, b, c, d] = quad.split(".").map(Number);
  return [(a << 8) | b, (c << 8) | d];
};

const expandSide = (side: string): number[] =>
  side
    ? side
        .split(":")
        .flatMap((group) =>
          group.includes(".") ? quadToPair(group) : [parseInt(group, 16)],
        )
    : [];

const toHextets = (ip: string): number[] => {
  const [head, tail] = ip.split("::");
  const left = expandSide(head);
  if (tail === undefined) return left;
  const right = expandSide(tail);
  const gap = V6_GROUPS - left.length - right.length;
  return [...left, ...new Array<number>(gap).fill(0), ...right];
};

const v4From = (hi: number, lo: number): string =>
  [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");

const zeroHead = (h: number[], upTo: number): boolean =>
  h.slice(0, upTo).every((group) => group === 0);

const isNat64 = (h: number[]): boolean =>
  h[0] === NAT64_HI && h[1] === NAT64_LO;

const isV4Wrapper = (h: number[]): boolean =>
  zeroHead(h, 4) &&
  ((h[4] === 0 && (h[5] === 0 || h[5] === MAPPED_V4)) ||
    (h[4] === MAPPED_V4 && h[5] === 0));

const isLowReserved = (h: number[]): boolean =>
  (h[0] & 0xff00) === 0 && !isV4Wrapper(h) && !isNat64(h);

const tunnelledV4s = (h: number[]): string[] => {
  if (isV4Wrapper(h)) return [v4From(h[6], h[7])];
  if (isNat64(h)) return [v4From(h[6], h[7])];
  if (h[0] === SIX_TO_FOUR) return [v4From(h[1], h[2])];
  if (h[0] === TEREDO_HI && h[1] === 0) {
    return [v4From(h[2], h[3]), v4From(h[6] ^ TEREDO_FLIP, h[7] ^ TEREDO_FLIP)];
  }
  return [];
};

const isReservedV6 = (h: number[]): boolean =>
  (h[0] & 0xff00) === 0xff00 ||
  (h[0] & 0xff80) === 0xfe80 ||
  (h[0] & 0xfe00) === 0xfc00 ||
  (isNat64(h) && h[2] !== 0) ||
  isLowReserved(h);

export const isBlockedIp = (host: string): boolean => {
  const ip = strip(host).toLowerCase();
  if (isIP(ip) !== 6) return RESERVED_IPV4.test(ip);
  const hextets = toHextets(ip);
  const tunnelled = tunnelledV4s(hextets);
  return (
    tunnelled.some((v4) => RESERVED_IPV4.test(v4)) || isReservedV6(hextets)
  );
};

export interface LocalImageAccess {
  enabled: boolean;
  patterns: string[];
}

type Matcher = (value: string) => boolean;

let cacheKey = "";
let cacheMatchers: Matcher[] = [];

const normalIp = (value: string): string => {
  const bare = strip(value).toLowerCase();
  return isIP(bare) === 6 ? toHextets(bare).join(":") : bare;
};

const literalIp = (ip: string): Matcher => {
  const target = normalIp(ip);
  return (value) => normalIp(value) === target;
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
