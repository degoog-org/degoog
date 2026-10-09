import { confirmModal } from "../../../modules/modals/confirm-modal/confirm";
import { flashError, flashSuccess } from "../../shared/flash-msg";
import { sendStore, streamStoreOp } from "../api";
import { findRepo, hasUpdate, repoBehind, repoItems, repoKey } from "../model";
import { ADD_INPUT_ID } from "../render/repos/repo-add-form";
import { counted, st } from "../format";
import type { RepoInfo, StoreContext } from "../../../types/store-tab";

const GIT_PROTOCOLS = new Set(["http:", "https:", "ssh:"]);

const _isGitUrl = (url: string): boolean => {
  try {
    return GIT_PROTOCOLS.has(new URL(url.replace(/\.git$/, "")).protocol);
  } catch {
    return false;
  }
};

const _updateCount = (ctx: StoreContext, repo: RepoInfo): number =>
  repoItems(ctx.state, repo).filter(hasUpdate).length;

export const refreshRepo = async (
  ctx: StoreContext,
  url: string,
  quiet = false,
): Promise<void> => {
  const { state } = ctx;
  const repo = findRepo(state, url);
  if (!repo) return;
  const key = repoKey(url);
  const before = _updateCount(ctx, repo);
  state.repoBusy.add(key);
  state.repoNotes.delete(key);
  ctx.render();
  const res = await sendStore("/api/store/repos/refresh", { url: repo.url }, ctx.getToken);
  await ctx.reload();
  state.repoBusy.delete(key);
  const after = findRepo(state, url);
  if (!res.ok || !after || after.error) {
    state.repoNotes.set(key, { ok: false, text: st("still-failing") });
    if (!quiet) flashError(st("did-not-refresh-flash", { name: repo.name }));
  } else {
    const fresh = _updateCount(ctx, after) - before;
    state.repoNotes.set(key, {
      ok: true,
      text: fresh > 0 ? counted("up-to-date-updates", fresh) : st("up-to-date"),
    });
    if (!quiet) flashSuccess(st("up-to-date-flash", { name: repo.name }));
  }
  ctx.render();
};

export const refreshBehind = (ctx: StoreContext): void => {
  ctx.state.repos
    .filter((r) => repoBehind(ctx.state, r) > 0)
    .forEach((r) => void refreshRepo(ctx, r.url));
};

export const refreshAllRepos = async (ctx: StoreContext): Promise<void> => {
  const { state } = ctx;
  state.refreshingAll = true;
  state.repoNotes.clear();
  ctx.render();
  const result = await streamStoreOp("/api/store/repos/refresh/stream", "repo", (e) => {
    if (!e.url) return;
    if (e.phase === "start") state.repoBusy.add(repoKey(e.url));
    else state.repoBusy.delete(repoKey(e.url));
    ctx.render();
  });
  await ctx.reload();
  state.repoBusy.clear();
  state.refreshingAll = false;
  ctx.render();
  const failed = result ? state.repos.filter((r) => r.error).length : state.repos.length;
  if (failed) flashError(counted("repos-failed-flash", failed));
  else flashSuccess(st("all-refreshed"));
};

export const removeRepo = async (ctx: StoreContext, url: string): Promise<void> => {
  const { state } = ctx;
  const repo = findRepo(state, url);
  if (!repo) return;
  const ok = await confirmModal({
    title: st("remove-repo-title", { name: repo.name }),
    message: st("remove-repo-message"),
    confirmLabel: st("remove"),
    danger: true,
  });
  if (!ok) return;
  const key = repoKey(url);
  const installed = repoItems(state, repo).filter((i) => i.installed).length;
  if (installed) {
    state.repoNotes.set(key, {
      ok: false,
      text: counted("cant-remove", installed),
      showInstalled: true,
    });
    ctx.render();
    return;
  }
  const res = await sendStore("/api/store/repos", { url: repo.url }, ctx.getToken, "DELETE");
  if (!res.ok) {
    state.repoNotes.set(key, { ok: false, text: res.error || st("failed-remove-repo") });
    ctx.render();
    return;
  }
  state.repoSel = state.repoSel.filter((u) => u !== key);
  if (state.expanded === key) state.expanded = "";
  await ctx.reload();
  ctx.render();
  flashSuccess(st("removed-flash", { name: repo.name }));
};

export const addRepo = async (ctx: StoreContext): Promise<void> => {
  const { state } = ctx;
  const url = state.addDraft.trim();
  state.addError = "";
  if (!url) {
    ctx.render();
    ctx.focus(`#${ADD_INPUT_ID}`);
    return;
  }
  if (!_isGitUrl(url)) state.addError = st("add-invalid");
  else if (findRepo(state, url)) state.addError = st("add-duplicate");
  if (state.addError) {
    ctx.render();
    ctx.focus(`#${ADD_INPUT_ID}`);
    return;
  }
  state.adding = true;
  ctx.render();
  const res = await sendStore<RepoInfo>("/api/store/repos", { url }, ctx.getToken);
  if (res.ok) await ctx.reload();
  state.adding = false;
  const added = res.ok && res.data ? findRepo(state, res.data.url) : undefined;
  if (!added) {
    state.addError = res.error || st("failed-add-repo");
    ctx.render();
    ctx.focus(`#${ADD_INPUT_ID}`);
    return;
  }
  const key = repoKey(added.url);
  state.addDraft = "";
  state.expanded = key;
  state.repoNotes.set(key, {
    ok: true,
    text: counted("added-note", repoItems(state, added).length),
  });
  ctx.render();
  flashSuccess(st("added-flash", { name: added.name }));
};
