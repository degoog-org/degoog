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
  compatListHtml,
  compatPackages,
  compatShellHtml,
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

const _paint = (items: CompatCatalogItem[], query: string, layer: string): void => {
  const list = document.querySelector<HTMLElement>(`#${MODAL_BODY_ID} #compat-list`);
  if (!list) return;
  list.innerHTML = compatListHtml(compatFilter(items, query), layer);
  list
    .querySelectorAll<HTMLImageElement>(".compat-favicon")
    .forEach(attachFaviconFallback);
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

export const openCompatModal = async (layer: CompatLayerView): Promise<void> => {
  let items: CompatCatalogItem[] = [];
  let query = "";
  const name = layer.label;

  openCustomModal({
    title: t(`${KEY}compat-title`, { layer: name }),
    body: compatShellHtml(name),
    wide: true,
  });

  const body = document.getElementById(MODAL_BODY_ID);
  if (!body) return;

  const runAction = async (
    action: CompatAction,
    code: string,
    btn: HTMLButtonElement,
  ): Promise<void> => {
    btn.disabled = true;
    _say(t(BUSY_KEYS[action]));
    try {
      await sendCompat(layer.id, action, code);
      items = await fetchCompat(layer.id);
      _paint(items, query, name);
      window.dispatchEvent(new CustomEvent("extensions-saved"));
      _say(
        t(
          action === CompatAction.Update
            ? `${KEY}compat-updated`
            : `${KEY}compat-restart`,
          { layer: name },
        ),
      );
    } catch (err) {
      btn.disabled = false;
      _say(err instanceof Error ? err.message : String(err), true);
    }
  };

  const startInstall = async (
    code: string,
    btn: HTMLButtonElement,
  ): Promise<void> => {
    const item = items.find((entry) => entry.code === code);
    if (!(await _depsOkay(item, name))) return;
    await runAction(CompatAction.Install, code, btn);
  };

  bindCompatClicks(body, (event) => {
    const target = event.target as HTMLElement;
    const install = target.closest<HTMLButtonElement>(".compat-btn-install");
    const update = target.closest<HTMLButtonElement>(".compat-btn-update");
    const uninstall = target.closest<HTMLButtonElement>(".compat-btn-uninstall");
    if (install?.dataset.code) void startInstall(install.dataset.code, install);
    if (update?.dataset.code)
      void runAction(CompatAction.Update, update.dataset.code, update);
    if (uninstall?.dataset.code)
      void runAction(CompatAction.Uninstall, uninstall.dataset.code, uninstall);
  });

  const search = body.querySelector<HTMLInputElement>("#compat-search-input");
  search?.addEventListener("input", () => {
    query = search.value;
    _paint(items, query, name);
  });

  try {
    items = await fetchCompat(layer.id);
    _paint(items, query, name);
  } catch (err) {
    _say(err instanceof Error ? err.message : String(err), true);
  }
};

export { CompatLayerId };
