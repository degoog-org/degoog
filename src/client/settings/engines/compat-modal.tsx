import { clear, render } from "../../../shared/ui/tribute/dom";
import { attachFaviconFallback } from "../../utils/favicon";
import { bindCompatClicks } from "./compat-clicks";
import { openCustomModal } from "../../modules/modals/settings-modal/modal";
import { confirmModal } from "../../modules/modals/confirm-modal/confirm";
import {
  CompatAction,
  CompatLayerId,
  fetchCompat,
  sendCompat,
  type CompatLayerView,
} from "./compat-api";
import {
  compatFilter,
  CompatList,
  compatPackages,
  CompatShell,
  COMPAT_UPDATE_ICON,
  COMPAT_UPDATE_ICON_BUSY,
  type CompatListUi,
} from "./compat-render";
import type { CompatCatalogItem } from "../../types/compat-catalog";

const t = window.scopedT("core");

const MODAL_BODY_ID = "ext-modal-body";
const KEY = "settings-page.extensions.";

const BUSY_KEYS: Record<CompatAction, string> = {
  [CompatAction.Install]: `${KEY}compat-installing`,
  [CompatAction.Update]: `${KEY}compat-updating`,
  [CompatAction.Uninstall]: `${KEY}compat-uninstalling`,
};

const _statusEl = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(`#${MODAL_BODY_ID} #compat-status`);

const _say = (message: string, failed = false): void => {
  const el = _statusEl();
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("compat-status--error", failed);
};

const _paint = (
  items: CompatCatalogItem[],
  query: string,
  layer: string,
  ui: CompatListUi,
): void => {
  const list = document.querySelector<HTMLElement>(
    `#${MODAL_BODY_ID} #compat-list`,
  );
  if (!list) return;
  clear(list);
  render(
    <CompatList items={compatFilter(items, query)} layer={layer} ui={ui} />,
    list,
  );
  list
    .querySelectorAll<HTMLImageElement>(".compat-favicon")
    .forEach(attachFaviconFallback);
};

const _tip = (btn: HTMLButtonElement, label: string): void => {
  btn.setAttribute("aria-label", label);
  btn.dataset.tooltip = label;
};

const _spinUpdate = (btn: HTMLButtonElement, layer: string): void => {
  const icon = btn.querySelector("i");
  if (icon) icon.className = COMPAT_UPDATE_ICON_BUSY;
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.classList.remove("compat-btn-update--done");
  _tip(btn, t(BUSY_KEYS[CompatAction.Update], { layer }));
};

const _idleUpdate = (btn: HTMLButtonElement, layer: string): void => {
  const icon = btn.querySelector("i");
  if (icon) icon.className = COMPAT_UPDATE_ICON;
  btn.disabled = false;
  btn.removeAttribute("aria-busy");
  btn.classList.remove("compat-btn-update--done");
  _tip(btn, t(`${KEY}compat-update`, { layer }));
};

const _warnings = (item: CompatCatalogItem, layer: string): string[] => {
  const notes: string[] = [];
  const packages = compatPackages(item);
  if (item.missingDeps.length) {
    notes.push(
      t(`${KEY}compat-deps-body`, {
        layer,
        engine: item.name,
        deps: item.missingDeps.join(", "),
      }),
    );
  }
  if (packages.length) {
    notes.push(
      t(`${KEY}compat-runtime-body`, {
        layer,
        engine: item.name,
        packages: packages.join(" "),
      }),
    );
  }
  return notes;
};

const _depsOkay = async (
  item: CompatCatalogItem | undefined,
  layer: string,
): Promise<boolean> => {
  if (!item) return true;
  const notes = _warnings(item, layer);
  if (!notes.length) return true;
  return confirmModal({
    title: t(
      compatPackages(item).length
        ? `${KEY}compat-runtime-title`
        : `${KEY}compat-deps-title`,
    ),
    message: notes.join(" "),
  });
};

let _session = 0;

export const openCompatModal = async (
  layer: CompatLayerView,
): Promise<void> => {
  const session = ++_session;
  const live = (): boolean => session === _session;
  let items: CompatCatalogItem[] = [];
  let query = "";
  const name = layer.label;
  const updating = new Set<string>();
  const updated = new Set<string>();
  const ui = (): CompatListUi => ({ updating, updated });

  openCustomModal({
    title: t(`${KEY}compat-title`, { layer: name }),
    body: "",
    wide: true,
  });

  const body = document.getElementById(MODAL_BODY_ID);
  if (!body) return;
  clear(body);
  render(<CompatShell id={layer.id} />, body);

  const runAction = async (
    action: CompatAction,
    code: string,
    btn: HTMLButtonElement,
  ): Promise<void> => {
    const pulling = action === CompatAction.Update;
    if (pulling) {
      updated.delete(code);
      updating.add(code);
      _spinUpdate(btn, name);
    } else {
      btn.disabled = true;
      _say(t(BUSY_KEYS[action]));
    }
    try {
      await sendCompat(layer.id, action, code);
      items = await fetchCompat(layer.id);
      if (!live()) return;
      if (pulling) {
        updating.delete(code);
        updated.add(code);
      }
      _paint(items, query, name, ui());
      window.dispatchEvent(new CustomEvent("extensions-saved"));
      if (pulling) _say("");
      else _say(t(`${KEY}compat-restart`, { layer: name }));
    } catch (err) {
      if (!live()) return;
      if (pulling) {
        updating.delete(code);
        if (btn.isConnected) _idleUpdate(btn, name);
        else _paint(items, query, name, ui());
      } else {
        btn.disabled = false;
      }
      _say(err instanceof Error ? err.message : String(err), true);
    }
  };

  const startInstall = async (
    code: string,
    btn: HTMLButtonElement,
  ): Promise<void> => {
    const item = items.find((entry) => entry.code === code);
    if (!(await _depsOkay(item, name))) return;
    if (!live()) return;
    await runAction(CompatAction.Install, code, btn);
  };

  bindCompatClicks(body, (event) => {
    const target = event.target as HTMLElement;
    const install = target.closest<HTMLButtonElement>(".compat-btn-install");
    const update = target.closest<HTMLButtonElement>(".compat-btn-update");
    const uninstall = target.closest<HTMLButtonElement>(
      ".compat-btn-uninstall",
    );
    if (install?.dataset.code) void startInstall(install.dataset.code, install);
    if (update?.dataset.code)
      void runAction(CompatAction.Update, update.dataset.code, update);
    if (uninstall?.dataset.code)
      void runAction(CompatAction.Uninstall, uninstall.dataset.code, uninstall);
  });

  const search = body.querySelector<HTMLInputElement>("#compat-search-input");
  search?.addEventListener("input", () => {
    if (!live()) return;
    query = search.value;
    _paint(items, query, name, ui());
  });

  try {
    items = await fetchCompat(layer.id);
    if (!live()) return;
    _paint(items, query, name, ui());
  } catch (err) {
    if (!live()) return;
    _say(err instanceof Error ? err.message : String(err), true);
  }
};

export { CompatLayerId };
