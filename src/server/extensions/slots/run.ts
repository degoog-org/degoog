import {
  SLOT_POSITION_SETTING_KEY,
  type SlotPlugin,
  type SlotPluginContext,
} from "../../types/extension";
import {
  DEFAULT_SEARCH_TYPE,
  type ScoredResult,
  type SlotPanel,
  SlotPanelPosition,
} from "../../../shared/search-types";
import { createCache, useCache } from "../../utils/cache/cache";
import { logger } from "../../utils/logger";
import { outgoingFetch } from "../../utils/net/outgoing";
import { asString, getSettings, isDisabled } from "../../utils/settings/plugin-settings";
import { buildSignedProxyUrl, signFaviconUrl } from "../../utils/net/proxy-sign";
import { applyFilter, syncVortexSignal } from "../../utils/extension-support/translation-circuit";
import { SLOT_PLUGIN_TIMEOUT_MS, withTimeout } from "../../utils/net/with-timeout";
import { slotShowsOn } from "../../utils/extension-support/slot-types";
import { getSlotPlugins } from "./registry";

export const slotContext = (
  clientIp: string | undefined,
  results: ScoredResult[] | undefined,
  locale: string | undefined,
  nojs = false,
): SlotPluginContext => ({
  clientIp,
  results,
  fetch: outgoingFetch as SlotPluginContext["fetch"],
  signProxyUrl: buildSignedProxyUrl,
  signFaviconUrl,
  createCache,
  useCache,
  locale,
  ...(nojs ? { nojs: true } : {}),
});

export const toSlotPanel = (
  id: string,
  plugin: SlotPlugin,
  out: { title?: string; html: string },
  locale: string | undefined,
  position: SlotPanelPosition,
): SlotPanel | null => {
  if (!out.html || !out.html.trim()) return null;
  return {
    id,
    title: out.title,
    html: applyFilter(
      plugin.t ? syncVortexSignal(out.html, plugin.t, locale) : out.html,
      `slots/${id}`,
    ),
    position,
    gridSize: plugin.gridSize,
  };
};

export const slotPosition = async (
  plugin: SlotPlugin,
  settingsId: string,
): Promise<SlotPanelPosition> => {
  if (!plugin.slotPositions?.length) return plugin.position;
  const raw = await getSettings(settingsId);
  const chosen = asString(raw[SLOT_POSITION_SETTING_KEY]);
  return chosen && plugin.slotPositions.includes(chosen as SlotPanelPosition)
    ? (chosen as SlotPanelPosition)
    : plugin.position;
};

type SlotRun = {
  query: string;
  clientIp?: string;
  results?: ScoredResult[];
  exclude?: SlotPanelPosition;
  locale?: string;
  searchType: string;
  nojs: boolean;
};

const _runSlot = async (
  plugin: SlotPlugin,
  { query, clientIp, results, exclude, locale, searchType, nojs }: SlotRun,
): Promise<SlotPanel | null> => {
  if (!plugin.id) {
    logger.warn(
      "slots",
      `Skipping slot plugin: missing id (name="${plugin.name}")`,
    );
    return null;
  }
  if (nojs && plugin.supportsNojs !== true) return null;
  const slotSettingsId = plugin.settingsId ?? `slot-${plugin.id}`;
  const definedPosition = await slotPosition(plugin, slotSettingsId);
  if (exclude && definedPosition === exclude) return null;
  if (!(await slotShowsOn(plugin, slotSettingsId, searchType))) return null;
  const withResults = results !== undefined;
  if (withResults && !plugin.waitForResults) return null;
  if (!withResults && plugin.waitForResults) return null;
  try {
    if (await isDisabled(slotSettingsId)) return null;
    const ok = await Promise.resolve(plugin.trigger(query.trim()));
    if (!ok) return null;
    const context = slotContext(
      clientIp,
      plugin.waitForResults ? results : undefined,
      locale,
      nojs,
    );
    const t0 = performance.now();
    const out = await withTimeout(
      Promise.resolve(plugin.execute(query, context)),
      SLOT_PLUGIN_TIMEOUT_MS,
      `slot ${plugin.id}`,
    );
    logger.debug(
      "plugin",
      `${plugin.id} executed in ${Math.round(performance.now() - t0)}ms`,
    );
    return toSlotPanel(plugin.id, plugin, out, locale, definedPosition);
  } catch (err) {
    logger.debug("plugin", `${plugin.id} skipped`, err);
    return null;
  }
};

export const runSlotPlugins = async (
  query: string,
  clientIp?: string,
  results?: ScoredResult[],
  options?: {
    excludePosition?: SlotPanelPosition;
    locale?: string;
    searchType?: string;
    nojs?: boolean;
  },
): Promise<SlotPanel[]> => {
  const run: SlotRun = {
    query,
    clientIp,
    results,
    exclude: options?.excludePosition,
    locale: options?.locale,
    searchType: options?.searchType ?? DEFAULT_SEARCH_TYPE,
    nojs: options?.nojs === true,
  };
  const panels = await Promise.all(
    getSlotPlugins().map((plugin) => _runSlot(plugin, run)),
  );
  return panels.filter((panel): panel is SlotPanel => panel !== null);
};
