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
import { buildSignedProxyUrl } from "../../utils/net/proxy-sign";
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

export async function runSlotPlugins(
  query: string,
  clientIp?: string,
  results?: ScoredResult[],
  options?: {
    excludePosition?: SlotPanelPosition;
    locale?: string;
    searchType?: string;
    nojs?: boolean;
  },
): Promise<SlotPanel[]> {
  const plugins = getSlotPlugins();
  const panels: SlotPanel[] = [];
  const exclude = options?.excludePosition;
  const locale = options?.locale;
  const nojs = options?.nojs === true;
  const searchType = options?.searchType ?? DEFAULT_SEARCH_TYPE;
  for (const plugin of plugins) {
    if (!plugin.id) {
      logger.warn(
        "slots",
        `Skipping slot plugin: missing id (name="${plugin.name}")`,
      );
      continue;
    }
    if (nojs && plugin.supportsNojs !== true) continue;
    const slotSettingsId = plugin.settingsId ?? `slot-${plugin.id}`;
    const definedPosition = await slotPosition(plugin, slotSettingsId);
    if (exclude && definedPosition === exclude) continue;
    if (!(await slotShowsOn(plugin, slotSettingsId, searchType))) continue;
    const withResults = results !== undefined;
    if (withResults && !plugin.waitForResults) continue;
    if (!withResults && plugin.waitForResults) continue;
    try {
      if (await isDisabled(slotSettingsId)) continue;
      const ok = await Promise.resolve(plugin.trigger(query.trim()));
      if (!ok) continue;
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
      const panel = toSlotPanel(plugin.id, plugin, out, locale, definedPosition);
      if (panel) panels.push(panel);
    } catch (err) {
      logger.debug("plugin", `${plugin.id} skipped`, err);
    }
  }
  return panels;
}
