import { lineupUrls } from "./outgoing";
import {
  DIRECT_EGRESS,
  benchedUntil,
  jerseyFor,
  recentStrikeouts,
  siteFor,
} from "./proxy-bench";
import { rosterIdFor, rosterUrlFor } from "./proxy-roster";

export interface BenchedSite {
  site: string;
  trigger: string;
  at: number;
  until: number;
}

export interface LineupSpot {
  position: number;
  label: string;
  benched: BenchedSite[];
}

export interface EgressScout {
  direct: boolean;
  known: boolean;
  position?: number;
  label?: string;
  site: string;
  current: boolean;
  benchedUntil: number;
}

export interface ProxyScoreboard {
  lineup(): Promise<LineupSpot[]>;
  scout(egressKey: string, host: string): Promise<EgressScout>;
}

const JERSEY_SPLIT = ".";

export const nameplate = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "unreadable proxy url";
  }
};

const _positionOf = async (proxyId: string): Promise<number | undefined> => {
  const index = (await lineupUrls()).findIndex((url) => rosterIdFor(url) === proxyId);
  return index >= 0 ? index + 1 : undefined;
};

const lineup = async (): Promise<LineupSpot[]> => {
  const urls = await lineupUrls();
  const now = Date.now();
  const strikeouts = recentStrikeouts().filter((s) => s.until > now);
  return urls.map((url, index) => {
    const id = rosterIdFor(url);
    return {
      position: index + 1,
      label: nameplate(url),
      benched: strikeouts
        .filter((s) => s.proxyId === id)
        .map(({ site, trigger, at, until }) => ({ site, trigger, at, until })),
    };
  });
};

const scout = async (egressKey: string, host: string): Promise<EgressScout> => {
  const site = await siteFor(host);
  if (egressKey === DIRECT_EGRESS) {
    return { direct: true, known: true, site, current: true, benchedUntil: 0 };
  }
  const proxyId = egressKey.split(JERSEY_SPLIT)[0];
  const url = proxyId ? rosterUrlFor(proxyId) : undefined;
  if (!url) {
    return { direct: false, known: false, site, current: false, benchedUntil: 0 };
  }
  const [position, jersey, until] = await Promise.all([
    _positionOf(proxyId),
    jerseyFor(proxyId, host),
    benchedUntil(proxyId, host),
  ]);
  return {
    direct: false,
    known: true,
    position,
    label: nameplate(url),
    site,
    current: jersey === egressKey,
    benchedUntil: until,
  };
};

export const proxyScoreboard: ProxyScoreboard = { lineup, scout };
