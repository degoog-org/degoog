import { confirmModal } from "../../../modules/modals/confirm-modal/confirm";
import { flashError, flashSuccess } from "../../shared/flash-msg";
import { sendStore, streamStoreOp } from "../api";
import { hasUpdate, itemId, sortByName } from "../model";
import { kindLabel } from "../render/labels";
import { counted, st } from "../format";
import type {
  StoreBusy,
  StoreContext,
  StoreItem,
  StoreVerb,
} from "../../../types/store-tab";

const FAILED_CLEAR_MS = 6000;

const _body = (item: StoreItem): Record<string, string> => ({
  repoUrl: item.repoUrl,
  itemPath: item.path,
  type: item.type,
});

const _saved = (): void => {
  window.dispatchEvent(new CustomEvent("extensions-saved"));
};

const _fail = (ctx: StoreContext, id: string, verb: StoreVerb, error?: string): void => {
  const failure = { verb, message: error || st(`${verb}-failed`) };
  ctx.state.failed.set(id, failure);
  window.setTimeout(() => {
    if (ctx.state.failed.get(id) !== failure) return;
    ctx.state.failed.delete(id);
    ctx.render();
  }, FAILED_CLEAR_MS);
};

const _run = async (
  ctx: StoreContext,
  item: StoreItem,
  busy: StoreBusy,
  verb: StoreVerb,
  path: string,
  body: Record<string, string>,
  method: "POST" | "DELETE" = "POST",
): Promise<boolean> => {
  const id = itemId(item);
  ctx.state.failed.delete(id);
  ctx.state.busy.set(id, busy);
  ctx.render();
  const res = await sendStore(path, body, ctx.getToken, method);
  if (res.ok) await ctx.reload();
  ctx.state.busy.delete(id);
  if (!res.ok) _fail(ctx, id, verb, res.error);
  ctx.render();
  if (res.ok) _saved();
  return res.ok;
};

export const installItem = async (ctx: StoreContext, item: StoreItem): Promise<void> => {
  if (
    item.type === "plugin" &&
    !(await confirmModal({
      title: st("install-plugin-title"),
      message: st("install-plugin-message"),
      confirmLabel: st("install"),
    }))
  )
    return;
  if (await _run(ctx, item, "installing", "install", "/api/store/install", _body(item)))
    flashSuccess(st("installed-flash", { name: item.name }));
};

export const updateItem = async (ctx: StoreContext, item: StoreItem): Promise<void> => {
  if (!(await _run(ctx, item, "updating", "update", "/api/store/update", _body(item)))) return;
  flashSuccess(st("updated-flash", { name: item.name, version: item.version }));
  ctx.showRestartNotice();
};

export const uninstallItem = async (ctx: StoreContext, item: StoreItem): Promise<void> => {
  const ok = await confirmModal({
    title: st("uninstall-title", { name: item.name }),
    message: st("uninstall-message", { kind: kindLabel(item.type).toLowerCase() }),
    confirmLabel: st("uninstall"),
    danger: true,
  });
  if (!ok) return;
  if (await _run(ctx, item, "uninstalling", "uninstall", "/api/store/uninstall", _body(item)))
    flashSuccess(st("uninstalled-flash", { name: item.name }));
};

export const deleteOrphan = async (ctx: StoreContext, item: StoreItem): Promise<void> => {
  const ok = await confirmModal({
    title: st("delete-title"),
    message: st("delete-message", { name: item.name }),
    confirmLabel: st("delete"),
    danger: true,
  });
  if (!ok) return;
  const done = item.untracked
    ? await _run(
        ctx,
        item,
        "deleting",
        "delete",
        "/api/store/untracked",
        { folderName: item.path, type: item.type },
        "DELETE",
      )
    : await _run(ctx, item, "deleting", "delete", "/api/store/uninstall", _body(item));
  if (done) flashSuccess(st("deleted-flash", { name: item.name }));
};

export const updateAllItems = async (ctx: StoreContext): Promise<void> => {
  const { state } = ctx;
  const list = state.items.filter(hasUpdate).sort(sortByName);
  const ids = new Set(list.map(itemId));
  Object.assign(state, { updatingAll: true, updatesOpen: true, updatesShowAll: true });
  list.forEach((item) => state.busy.set(itemId(item), "waiting"));
  ctx.render();
  const result = await streamStoreOp("/api/store/update-all/stream", "item", (e) => {
    const id = `${e.repoUrl}::${e.itemPath}::${e.type}`;
    if (!ids.has(id)) return;
    if (e.phase === "start") state.busy.set(id, "updating");
    else {
      state.busy.delete(id);
      if (e.phase === "failed") _fail(ctx, id, "update", e.error);
    }
    ctx.render();
  });
  await ctx.reload();
  list.forEach((item) => state.busy.delete(itemId(item)));
  Object.assign(state, { updatingAll: false, updatesOpen: false, updatesShowAll: false });
  ctx.render();
  _saved();
  const failed = result ? result.failed : list.length;
  if (failed) flashError(counted("update-all-failed", failed));
  else flashSuccess(counted("updated-all-flash", list.length));
  ctx.showRestartNotice();
};
