import { useCache } from "../cache/cache";
import { logger } from "../logger";
import { asString, type SettingValue } from "../settings/plugin-settings";
import { getInstanceSettings } from "../settings/server-settings";
import { SETTINGS_SCHEMA } from "../settings/settings-schema";

const NS = "proxy-bench";
const MS_PER_MINUTE = 60_000;
const EPOCH_TTL_MS = 24 * 60 * MS_PER_MINUTE;
const LABEL_PREVIEW = 8;
const GROUP_SPLIT_RE = /[\s,]+/;
const MAX_BOX_SCORES = 256;

export const DIRECT_EGRESS = "direct";
export const CONNECT_TRIGGER = "connect";

const _bench = useCache<number>("proxy:cooldown", MS_PER_MINUTE);
const _jerseys = useCache<number>("proxy:epoch", EPOCH_TTL_MS);

export interface Strikeout {
  proxyId: string;
  site: string;
  trigger: string;
  at: number;
  until: number;
}

const _boxScores = new Map<string, Strikeout>();

const _scoreIt = (key: string, strikeout: Strikeout): void => {
  _boxScores.delete(key);
  _boxScores.set(key, strikeout);
  if (_boxScores.size > MAX_BOX_SCORES) _boxScores.delete(_boxScores.keys().next().value!);
};

export const recentStrikeouts = (): Strikeout[] => [..._boxScores.values()].reverse();

export const siteFor = async (host: string): Promise<string> =>
  ballparkFor(host, (await _config()).groups);

interface CooldownConfig {
  cooldownMs: number;
  triggers: Set<string>;
  groups: string[][];
}

const _lines = (raw: string): string[] =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const _orDefault = (raw: SettingValue | undefined, fallback: string): string =>
  raw === undefined ? fallback : asString(raw);

const _minutes = (raw: SettingValue | undefined): number => {
  const parsed = Number(_orDefault(raw, SETTINGS_SCHEMA.proxyCooldownMinutes.default));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const _config = async (): Promise<CooldownConfig> => {
  const settings = await getInstanceSettings();
  return {
    cooldownMs: _minutes(settings.proxyCooldownMinutes) * MS_PER_MINUTE,
    triggers: new Set(
      _lines(_orDefault(settings.proxyCooldownTriggers, SETTINGS_SCHEMA.proxyCooldownTriggers.default))
        .map((t) => t.toLowerCase()),
    ),
    groups: _lines(asString(settings.proxyHostGroups)).map((line) =>
      line.split(GROUP_SPLIT_RE).map((h) => h.toLowerCase().replace(/\.$/, "")).filter(Boolean),
    ),
  };
};

const _coversHost = (entry: string, host: string): boolean =>
  host === entry || host.endsWith(`.${entry}`);

export const ballparkFor = (host: string, groups: string[][]): string => {
  const bare = host.toLowerCase().replace(/\.$/, "");
  const group = groups.find((hosts) => hosts.some((entry) => _coversHost(entry, bare)));
  return group ? group.join(",") : bare;
};

const _key = async (proxyId: string, host: string): Promise<string> => {
  const { groups } = await _config();
  return `${proxyId}|${ballparkFor(host, groups)}`;
};

export const benchedUntil = async (proxyId: string, host: string): Promise<number> => {
  const until = await _bench.get(await _key(proxyId, host));
  return typeof until === "number" && until > Date.now() ? until : 0;
};

export const jerseyFor = async (
  proxyId: string | undefined,
  host: string,
): Promise<string> => {
  if (!proxyId) return DIRECT_EGRESS;
  const epoch = (await _jerseys.get(await _key(proxyId, host))) ?? 0;
  return `${proxyId}.${epoch}`;
};

export const strikeOut = async (
  proxyId: string,
  host: string,
  trigger: string,
): Promise<boolean> => {
  const config = await _config();
  if (!config.triggers.has(trigger.toLowerCase())) return false;
  const site = ballparkFor(host, config.groups);
  const key = `${proxyId}|${site}`;
  const epoch = (await _jerseys.get(key)) ?? 0;
  await _jerseys.set(key, epoch + 1);
  const label = proxyId.slice(0, LABEL_PREVIEW);
  const at = Date.now();
  _scoreIt(key, { proxyId, site, trigger, at, until: config.cooldownMs > 0 ? at + config.cooldownMs : 0 });
  if (config.cooldownMs <= 0) {
    logger.info(NS, `proxy ${label} struck out on ${site} (${trigger}); new jersey, stays in the lineup`);
    return true;
  }
  await _bench.set(key, Date.now() + config.cooldownMs, config.cooldownMs);
  logger.info(
    NS,
    `proxy ${label} struck out on ${site} (${trigger}); new jersey, benched for ${config.cooldownMs / MS_PER_MINUTE}m`,
  );
  return true;
};
