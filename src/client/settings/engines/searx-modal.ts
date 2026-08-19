import { attachFaviconFallback } from "../../utils/favicon";
import { openCustomModal } from "../../modules/modals/settings-modal/modal";
import { confirmModal } from "../../modules/modals/confirm-modal/confirm";
import { SearxAction, fetchSearx, sendSearx } from "./searx-api";
import {
  searxFilter,
  searxListHtml,
  searxPackages,
  searxShellHtml,
} from "./searx-render";
import type { SearxCatalogItem } from "../../types/searx-catalog";

const t = window.scopedT("core");

const MODAL_BODY_ID = "ext-modal-body";

const BUSY_KEYS: Record<SearxAction, string> = {
  [SearxAction.Install]: "settings-page.extensions.searx-installing",
  [SearxAction.Update]: "settings-page.extensions.searx-updating",
  [SearxAction.Uninstall]: "settings-page.extensions.searx-uninstalling",
};

const _statusEl = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(`#${MODAL_BODY_ID} #searx-status`);

const _say = (message: string, failed = false): void => {
  const el = _statusEl();
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("searx-status--error", failed);
};

const _paint = (items: SearxCatalogItem[], query: string): void => {
  const list = document.querySelector<HTMLElement>(`#${MODAL_BODY_ID} #searx-list`);
  if (!list) return;
  list.innerHTML = searxListHtml(searxFilter(items, query));
  list
    .querySelectorAll<HTMLImageElement>(".searx-favicon")
    .forEach(attachFaviconFallback);
};

const _warnings = (item: SearxCatalogItem): string[] => {
  const notes: string[] = [];
  const packages = searxPackages(item);
  if (item.missingDeps.length) {
    notes.push(
      t("settings-page.extensions.searx-deps-body", {
        engine: item.name,
        deps: item.missingDeps.join(", "),
        count: String(item.missingDeps.length),
      }),
    );
  }
  if (packages.length) {
    notes.push(
      t("settings-page.extensions.searx-libs-body", {
        engine: item.name,
        packages: packages.join(" "),
      }),
    );
  }
  return notes;
};

const _depsOkay = async (item: SearxCatalogItem | undefined): Promise<boolean> => {
  if (!item) return true;
  const notes = _warnings(item);
  if (!notes.length) return true;
  return confirmModal({
    title: t(
      searxPackages(item).length
        ? "settings-page.extensions.searx-libs-title"
        : "settings-page.extensions.searx-deps-title",
    ),
    message: notes.join(" "),
  });
};

export const openSearxModal = async (): Promise<void> => {
  let items: SearxCatalogItem[] = [];
  let query = "";

  openCustomModal({
    title: t("settings-page.extensions.searx-title"),
    body: searxShellHtml(),
    wide: true,
  });

  const body = document.getElementById(MODAL_BODY_ID);
  if (!body) return;

  const runAction = async (
    action: SearxAction,
    code: string,
    btn: HTMLButtonElement,
  ): Promise<void> => {
    btn.disabled = true;
    _say(t(BUSY_KEYS[action]));
    try {
      await sendSearx(action, code);
      items = await fetchSearx();
      _paint(items, query);
      window.dispatchEvent(new CustomEvent("extensions-saved"));
      _say(
        t(
          action === SearxAction.Update
            ? "settings-page.extensions.searx-updated"
            : "settings-page.extensions.searx-restart",
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
    if (!(await _depsOkay(item))) return;
    await runAction(SearxAction.Install, code, btn);
  };

  body.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const install = target.closest<HTMLButtonElement>(".searx-btn-install");
    const update = target.closest<HTMLButtonElement>(".searx-btn-update");
    const uninstall = target.closest<HTMLButtonElement>(".searx-btn-uninstall");
    if (install?.dataset.code) void startInstall(install.dataset.code, install);
    if (update?.dataset.code)
      void runAction(SearxAction.Update, update.dataset.code, update);
    if (uninstall?.dataset.code)
      void runAction(SearxAction.Uninstall, uninstall.dataset.code, uninstall);
  });

  const search = body.querySelector<HTMLInputElement>("#searx-search-input");
  search?.addEventListener("input", () => {
    query = search.value;
    _paint(items, query);
  });

  try {
    items = await fetchSearx();
    _paint(items, query);
  } catch (err) {
    _say(err instanceof Error ? err.message : String(err), true);
  }
};
