import type { Context } from "hono";
import {
  DEFAULT_ENGINE_ORIGIN_DISPLAY,
  EngineOriginDisplay,
  isOriginDisplay,
  type EngineOrigin,
} from "../../shared/engine-origins";
import {
  DEGOOG_ENGINE_NAME,
  type EngineTiming,
  type SlotPanel,
} from "../../shared/search-types";
import { listEngines } from "../extensions/engines/catalog";
import type { Translate } from "../types/extension";
import { logger } from "../utils/logger";
import { asString } from "../utils/settings/plugin-settings";
import { getInstanceSettings } from "../utils/settings/server-settings";
import { retryHref, type NojsQuery } from "./links";
import { renderHtml } from "../../shared/ui/tribute/html";
import { RawDogIt } from "../../shared/ui/tribute/rawdogit";
import { EngineOriginSlot } from "./engine-origin-slot";
import { EngineStatReason } from "./engine-stat-reason";
import { EngineStatRow } from "./engine-stat-row";
import { NojsAccordion } from "./nojs-accordion";
import type { Child } from "../../shared/ui/tribute/types";

const ACCORDION_BASE_CLASS =
  "sidebar-panel sidebar-accordion degoog-panel degoog-panel--accordion degoog-panel--stack-item";
const ACCORDION_CLASS =
  "sidebar-panel sidebar-accordion engine-performance-panel degoog-panel degoog-panel--accordion degoog-panel--stack-item";
interface OriginLookup {
  byId: Map<string, EngineOrigin>;
  byName: Map<string, EngineOrigin>;
}

const _originMode = async (): Promise<EngineOriginDisplay> => {
  const settings = await getInstanceSettings();
  const value = asString(settings.engineOriginDisplay);
  return isOriginDisplay(value) ? value : DEFAULT_ENGINE_ORIGIN_DISPLAY;
};

const _lookupOrigins = async (): Promise<OriginLookup> => {
  const lookup: OriginLookup = { byId: new Map(), byName: new Map() };
  try {
    for (const engine of await listEngines()) {
      if (!engine.origin) continue;
      lookup.byId.set(engine.id, engine.origin);
      lookup.byName.set(engine.displayName.toLowerCase(), engine.origin);
    }
  } catch (err) {
    logger.warn("nojs", "could not read engine origins for the sidebar", err);
  }
  return lookup;
};

const _originSlot = (
  timing: EngineTiming,
  origins: OriginLookup,
  mode: EngineOriginDisplay,
  locale: string,
  t: Translate,
): Child => {
  if (mode === EngineOriginDisplay.Off) return null;
  const origin =
    (timing.id ? origins.byId.get(timing.id) : undefined) ??
    origins.byName.get(timing.name.toLowerCase());
  if (!origin) return null;
  return (
    <EngineOriginSlot
      origin={origin}
      mode={mode}
      engineName={timing.name}
      engineId={timing.id}
      label={String(
        t(
          "search-templates.sidebar.engine-origin",
          { source: origin.label },
          locale,
        ),
      )}
    />
  );
};

const _failureText = (
  timing: EngineTiming,
  locale: string,
  t: Translate,
): string => {
  if (!timing.status || timing.status === "ok") return "";
  const key = `search-templates.sidebar.failure-reasons.${timing.status}`;
  const mapped = String(t(key, undefined, locale));
  const base =
    mapped === key
      ? String(
          t(
            "search-templates.sidebar.failure-reasons.unknown",
            undefined,
            locale,
          ),
        )
      : mapped;
  return timing.httpStatus ? `${base} (${timing.httpStatus})` : base;
};

const _countNode = (
  timing: EngineTiming,
  label: string,
  locale: string,
  t: Translate,
): Child => {
  const reason = _failureText(timing, locale, t);
  if (!reason) return label;
  return <EngineStatReason reason={reason} label={label} />;
};

export const renderNojsKnowledgePanels = (
  panels: SlotPanel[],
  locale: string,
  t: Translate,
): string =>
  panels
    .map((panel) =>
      renderHtml(
        <NojsAccordion
          class={ACCORDION_BASE_CLASS}
          slot={panel.id}
          title={
            panel.title ??
            String(t("search-templates.sidebar.info", undefined, locale))
          }
        >
          <RawDogIt html={panel.html} />
        </NojsAccordion>,
      ),
    )
    .join("");

export const renderNojsSidebar = async (
  c: Context,
  query: NojsQuery,
  timings: EngineTiming[],
  canRetry: boolean,
  locale: string,
  t: Translate,
): Promise<string> => {
  if (timings.length === 0) return "";

  const mode = await _originMode();
  const origins =
    mode === EngineOriginDisplay.Off
      ? { byId: new Map(), byName: new Map() }
      : await _lookupOrigins();

  const rows = timings.map((timing) => {
    const isDegoog = timing.name === DEGOOG_ENGINE_NAME;
    const failed = !!timing.status && timing.status !== "ok";
    const count = String(timing.resultCount);
    const countNode: Child = isDegoog
      ? String(t("search-templates.sidebar.from-index", { count }, locale))
      : _countNode(
          timing,
          String(t("search-templates.sidebar.results", { count }, locale)),
          locale,
          t,
        );
    return (
      <EngineStatRow
        failed={!isDegoog && failed}
        originSlot={_originSlot(timing, origins, mode, locale, t)}
        name={timing.name}
        meta={
          <>
            {countNode}
            {` · ${timing.time}ms`}
          </>
        }
        retryHref={
          isDegoog || !canRetry
            ? undefined
            : retryHref(c, query, timing.id ?? timing.name)
        }
        retryLabel={String(
          t("search-templates.sidebar.retry", undefined, locale),
        )}
      />
    );
  });

  return renderHtml(
    <NojsAccordion
      class={ACCORDION_CLASS}
      title={String(
        t("search-templates.sidebar.engine-performance", undefined, locale),
      )}
    >
      {rows}
    </NojsAccordion>,
  );
};
