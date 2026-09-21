import { renderHtml } from "../../../shared/ui/core/html";
import { EngineOriginSlot } from "./engine-origin-slot";
import {
  DEFAULT_ENGINE_ORIGIN_DISPLAY,
  EngineOriginDisplay,
  isOriginDisplay,
  type EngineOrigin,
} from "../../../shared/engine-origins";
import { ENGINE_ORIGIN_DISPLAY } from "../../constants";
import { idbGet } from "../db";
import { getRegistry } from "../engines";
import { onWindowEvent } from "../window-event";

declare global {
  interface Window {
    __DEGOOG_ENGINE_ORIGINS__?: string;
  }
}

const t = window.scopedT("themes/degoog");

const PAINTED_FLAG = "true";

interface OriginLookup {
  byId: Map<string, EngineOrigin>;
  byName: Map<string, EngineOrigin>;
}

let _lookup: OriginLookup | null = null;
let _inflight: Promise<OriginLookup> | null = null;
let _mode: EngineOriginDisplay | null = null;

onWindowEvent("extensions-saved", () => {
  _lookup = null;
  _inflight = null;
  _mode = null;
});

const _instanceMode = (): EngineOriginDisplay => {
  const value = window.__DEGOOG_ENGINE_ORIGINS__;
  return isOriginDisplay(value) ? value : DEFAULT_ENGINE_ORIGIN_DISPLAY;
};

const _displayMode = async (): Promise<EngineOriginDisplay> => {
  if (_mode) return _mode;
  try {
    const saved = await idbGet<string>(ENGINE_ORIGIN_DISPLAY);
    _mode = isOriginDisplay(saved) ? saved : _instanceMode();
  } catch (err) {
    console.warn("[origins] could not read the display preference", err);
    _mode = _instanceMode();
  }
  return _mode;
};

const _emptyLookup = (): OriginLookup => ({
  byId: new Map<string, EngineOrigin>(),
  byName: new Map<string, EngineOrigin>(),
});

const _lookupOrigins = async (): Promise<OriginLookup> => {
  if (_lookup) return _lookup;
  if (!_inflight) {
    _inflight = getRegistry()
      .then((registry) => {
        const found = _emptyLookup();
        registry.engines.forEach((engine) => {
          if (!engine.origin) return;
          found.byId.set(engine.id, engine.origin);
          found.byName.set(engine.displayName.toLowerCase(), engine.origin);
        });
        _lookup = found;
        _inflight = null;
        return found;
      })
      .catch((err) => {
        console.warn("[origins] engine registry lookup failed", err);
        _inflight = null;
        return _emptyLookup();
      });
  }
  return _inflight;
};

export const originSlot = (engineName: string, engineId?: string): string =>
  renderHtml(<EngineOriginSlot engineName={engineName} engineId={engineId} />);

const _glyph = (origin: EngineOrigin): HTMLElement => {
  const glyph = document.createElement("i");
  glyph.className = `fa-solid ${origin.glyph} engine-origin-glyph`;
  return glyph;
};

const _image = (slot: HTMLElement, src: string): HTMLElement => {
  const icon = document.createElement("img");
  icon.className = "engine-origin-icon";
  icon.src = src;
  icon.alt = "";
  icon.loading = "lazy";
  icon.addEventListener("error", () => slot.remove());
  return icon;
};

const _artwork = (
  slot: HTMLElement,
  origin: EngineOrigin,
  mode: EngineOriginDisplay,
): HTMLElement | null => {
  if (mode === EngineOriginDisplay.Favicon && origin.favicon) {
    return _image(slot, origin.favicon);
  }
  if (origin.icon) return _image(slot, origin.icon);
  if (origin.glyph) return _glyph(origin);
  return null;
};

const _paintOne = (
  slot: HTMLElement,
  origin: EngineOrigin,
  mode: EngineOriginDisplay,
): void => {
  const artwork = _artwork(slot, origin, mode);
  if (!artwork) return;
  const label = t("search-templates.sidebar.engine-origin", {
    source: origin.label,
  });
  slot.title = label;
  slot.setAttribute("aria-label", label);
  slot.dataset.painted = PAINTED_FLAG;
  slot.replaceChildren(artwork);
};

const _originFor = (
  slot: HTMLElement,
  origins: OriginLookup,
): EngineOrigin | undefined => {
  const id = slot.dataset.engineId ?? "";
  if (id && origins.byId.has(id)) return origins.byId.get(id);
  return origins.byName.get((slot.dataset.engine ?? "").toLowerCase());
};

export const paintOrigins = async (root: HTMLElement): Promise<void> => {
  const slots = Array.from(
    root.querySelectorAll<HTMLElement>(".engine-origin:not([data-painted])"),
  );
  if (slots.length === 0) return;
  const mode = await _displayMode();
  if (mode === EngineOriginDisplay.Off) {
    slots.forEach((slot) => slot.remove());
    return;
  }
  const origins = await _lookupOrigins();
  slots.forEach((slot) => {
    const origin = _originFor(slot, origins);
    if (origin) _paintOne(slot, origin, mode);
  });
};
