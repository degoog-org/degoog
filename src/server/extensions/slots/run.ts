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
import type { OrderedSlotPanel } from "../../../shared/slot-stream";

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

export const GLANCE_PENDING = "pending";

export type SlotOutcome = SlotPanel | typeof GLANCE_PENDING | null;

export type SlotSettled = (outcome: SlotOutcome, order: number) => void;

export interface SlotRunOptions {
  excludePosition?: SlotPanelPosition;
  locale?: string;
  searchType?: string;
  nojs?: boolean;
  glance?: boolean;
  signal?: AbortSignal;
}

export interface SlotRunInput extends SlotRunOptions {
  query: string;
  clientIp?: string;
  results?: ScoredResult[];
}

type SlotRun = {
  query: string;
  clientIp?: string;
  results?: ScoredResult[];
  exclude?: SlotPanelPosition;
  locale?: string;
  searchType: string;
  nojs: boolean;
  glance: boolean;
  signal?: AbortSignal;
};

export const isSlotPanel = (outcome: SlotOutcome): outcome is SlotPanel =>
  outcome !== null && outcome !== GLANCE_PENDING;

const _executeBudgetMs = (plugin: SlotPlugin): number =>
  typeof plugin.timeoutMs === "number" && Number.isFinite(plugin.timeoutMs)
    ? Math.max(SLOT_PLUGIN_TIMEOUT_MS, plugin.timeoutMs)
    : SLOT_PLUGIN_TIMEOUT_MS;

const _inPlace = (position: SlotPanelPosition, run: SlotRun): boolean =>
  run.glance
    ? position === SlotPanelPosition.AtAGlance
    : position !== run.exclude;

const _waitsElsewhere = (plugin: SlotPlugin, run: SlotRun): boolean =>
  !run.glance && (run.results !== undefined) !== Boolean(plugin.waitForResults);

const _settle = async (
  plugin: SlotPlugin,
  id: string,
  run: SlotRun,
): Promise<SlotOutcome> => {
  const settingsId = plugin.settingsId ?? `slot-${id}`;
  const position = await slotPosition(plugin, settingsId);
  if (!_inPlace(position, run) || _waitsElsewhere(plugin, run)) return null;
  if (await isDisabled(settingsId)) return null;
  if (!(await slotShowsOn(plugin, settingsId, run.searchType))) return null;
  const triggered = await withTimeout(
    Promise.resolve(plugin.trigger(run.query.trim())),
    SLOT_PLUGIN_TIMEOUT_MS,
    `slot ${id} trigger`,
    run.signal,
  );
  if (!triggered) return null;
  if (run.glance && run.results === undefined && plugin.waitForResults) {
    return GLANCE_PENDING;
  }
  const context = slotContext(
    run.clientIp,
    run.glance || plugin.waitForResults ? run.results : undefined,
    run.locale,
    run.nojs,
  );
  const t0 = performance.now();
  const out = await withTimeout(
    Promise.resolve(plugin.execute(run.query, context)),
    _executeBudgetMs(plugin),
    `slot ${id}`,
    run.signal,
  );
  logger.debug(
    "plugin",
    `${id} executed in ${Math.round(performance.now() - t0)}ms`,
  );
  return toSlotPanel(id, plugin, out, run.locale, position);
};

function _reportFailure(id: string, run: SlotRun, err: unknown): void {
  if (run.glance && !run.signal?.aborted) {
    logger.warn("plugin", `${id} slot failed`, err);
  } else {
    logger.debug("plugin", `${id} skipped`, err);
  }
}

const _runSlot = async (
  plugin: SlotPlugin,
  run: SlotRun,
): Promise<SlotOutcome> => {
  if (!plugin.id) {
    logger.warn(
      "slots",
      `Skipping slot plugin: missing id (name="${plugin.name}")`,
    );
    return null;
  }
  if (run.nojs && plugin.supportsNojs !== true) return null;
  try {
    return await _settle(plugin, plugin.id, run);
  } catch (err) {
    _reportFailure(plugin.id, run, err);
    return null;
  }
};

const _toRun = (input: SlotRunInput): SlotRun => ({
  query: input.query,
  clientIp: input.clientIp,
  results: input.results,
  exclude: input.excludePosition,
  locale: input.locale,
  searchType: input.searchType ?? DEFAULT_SEARCH_TYPE,
  nojs: input.nojs === true,
  glance: input.glance === true,
  signal: input.signal,
});

export const settleSlotPlugins = (
  input: SlotRunInput,
  onSettled?: SlotSettled,
): Promise<SlotOutcome[]> => {
  const run = _toRun(input);
  return Promise.all(
    getSlotPlugins().map(async (plugin, order) => {
      const outcome = await _runSlot(plugin, run);
      onSettled?.(outcome, order);
      return outcome;
    }),
  );
};

export const collectSlotPanels = async (
  input: SlotRunInput,
): Promise<OrderedSlotPanel[]> =>
  (await settleSlotPlugins(input)).flatMap((outcome, order) =>
    isSlotPanel(outcome) ? [{ ...outcome, order }] : [],
  );

export const runSlotPlugins = async (
  query: string,
  clientIp?: string,
  results?: ScoredResult[],
  options?: SlotRunOptions,
): Promise<SlotPanel[]> =>
  (await settleSlotPlugins({ ...options, query, clientIp, results })).filter(
    isSlotPanel,
  );
