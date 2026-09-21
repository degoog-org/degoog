import type { Context } from "hono";
import {
  DEFAULT_ENGINE_ORIGIN_DISPLAY,
  EngineOriginDisplay,
  isOriginDisplay,
  type EngineOrigin,
} from "../../shared/engine-origins";
import { DEGOOG_ENGINE_NAME } from "../../shared/search-types";
import { listEngines } from "../extensions/engines/registry";
import type { EngineTiming, SlotPanel, Translate } from "../types";
import { logger } from "../utils/logger";
import { asString } from "../utils/plugin-settings";
import { getInstanceSettings } from "../utils/server-settings";
import { retryHref, type NojsQuery } from "./links";
import { CHEVRON_SVG } from "../../shared/ui/components/layout/chevron";
import { SIDEBAR_BODY_CLASS, SIDEBAR_TOGGLE_CLASS } from "../../shared/ui/components/layout/sidebar-accordion";
import { escapeAttribute } from "./template";

const ACCORDION_BASE_CLASS =
  "sidebar-panel sidebar-accordion degoog-panel degoog-panel--accordion degoog-panel--stack-item";
const ACCORDION_CLASS =
  "sidebar-panel sidebar-accordion engine-performance-panel degoog-panel degoog-panel--accordion degoog-panel--stack-item";
const TOGGLE_CLASS = SIDEBAR_TOGGLE_CLASS;
const BODY_CLASS = SIDEBAR_BODY_CLASS;
const CHEVRON = CHEVRON_SVG;

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

const _artwork = (
  origin: EngineOrigin,
  mode: EngineOriginDisplay,
): string => {
  const src =
    mode === EngineOriginDisplay.Favicon && origin.favicon
      ? origin.favicon
      : origin.icon;
  if (src) {
    return `<img class="engine-origin-icon" src="${escapeAttribute(src)}" alt="" loading="lazy" />`;
  }
  if (origin.glyph) {
    return `<i class="fa-solid ${escapeAttribute(origin.glyph)} engine-origin-glyph"></i>`;
  }
  return "";
};

const _originSlot = (
  timing: EngineTiming,
  origins: OriginLookup,
  mode: EngineOriginDisplay,
  locale: string,
  t: Translate,
): string => {
  if (mode === EngineOriginDisplay.Off) return "";
  const origin =
    (timing.id ? origins.byId.get(timing.id) : undefined) ??
    origins.byName.get(timing.name.toLowerCase());
  if (!origin) return "";
  const artwork = _artwork(origin, mode);
  if (!artwork) return "";
  const label = String(
    t("search-templates.sidebar.engine-origin", { source: origin.label }, locale),
  );
  return (
    `<span class="engine-origin" data-engine="${escapeAttribute(timing.name)}"` +
    (timing.id ? ` data-engine-id="${escapeAttribute(timing.id)}"` : "") +
    ` title="${escapeAttribute(label)}" aria-label="${escapeAttribute(label)}">${artwork}</span>`
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
          t("search-templates.sidebar.failure-reasons.unknown", undefined, locale),
        )
      : mapped;
  return timing.httpStatus ? `${base} (${timing.httpStatus})` : base;
};

const _countHtml = (
  timing: EngineTiming,
  label: string,
  locale: string,
  t: Translate,
): string => {
  const reason = _failureText(timing, locale, t);
  if (!reason) return escapeAttribute(label);
  return `<span class="engine-stat-reason" data-tooltip="${escapeAttribute(reason)}" tabindex="0">${escapeAttribute(label)}</span>`;
};

export const renderNojsKnowledgePanels = (
  panels: SlotPanel[],
  locale: string,
  t: Translate,
): string =>
  panels
    .map((panel) => {
      const title = escapeAttribute(
        panel.title ??
          String(t("search-templates.sidebar.info", undefined, locale)),
      );
      return (
        `<details class="${ACCORDION_BASE_CLASS}" data-slot="${escapeAttribute(panel.id)}" open>` +
        `<summary class="${TOGGLE_CLASS}"><span>${title}</span>${CHEVRON}</summary>` +
        `<div class="${BODY_CLASS}">${panel.html}</div>` +
        "</details>"
      );
    })
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

  let rows = "";
  for (const timing of timings) {
    const isDegoog = timing.name === DEGOOG_ENGINE_NAME;
    const failed = !!timing.status && timing.status !== "ok";
    const statusClass = !isDegoog && failed ? " engine-failed" : "";
    const count = String(timing.resultCount);
    const countHtml = isDegoog
      ? escapeAttribute(
          String(t("search-templates.sidebar.from-index", { count }, locale)),
        )
      : _countHtml(
          timing,
          String(t("search-templates.sidebar.results", { count }, locale)),
          locale,
          t,
        );
    const meta = `${countHtml} · ${timing.time}ms`;
    const action =
      isDegoog || !canRetry
        ? ""
        : `<a class="engine-retry-link degoog-link" href="${escapeAttribute(
            retryHref(c, query, timing.id ?? timing.name),
          )}">${escapeAttribute(
            String(t("search-templates.sidebar.retry", undefined, locale)),
          )}</a>`;
    rows +=
      `<div class="engine-stat-row${statusClass}">` +
      '<div class="engine-stat-info">' +
      `<div class="engine-stat-label degoog-text">${_originSlot(timing, origins, mode, locale, t)}${escapeAttribute(timing.name)}</div>` +
      `<div class="engine-stat-meta degoog-text degoog-text--sm degoog-text--secondary">${meta}</div>` +
      "</div>" +
      action +
      "</div>";
  }

  const title = escapeAttribute(
    String(t("search-templates.sidebar.engine-performance", undefined, locale)),
  );
  return (
    `<details class="${ACCORDION_CLASS}" open>` +
    `<summary class="${TOGGLE_CLASS}"><span>${title}</span>${CHEVRON}</summary>` +
    `<div class="${BODY_CLASS}">${rows}</div>` +
    "</details>"
  );
};
