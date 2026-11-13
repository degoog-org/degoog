import { Hono, type Context } from "hono";
import { readObjectBody } from "../../utils/hono";
import { existsSync } from "fs";
import { resolve, relative } from "path";

import {
  getRepos,
  getReposStatus,
  addRepo,
  removeRepo,
  refreshRepo,
  refreshAllRepos,
  setRepoBeta,
} from "../../extensions/store/repo-ops";
import { isGlobalBetaStore } from "../../extensions/store/git";
import { listRepoItems } from "../../extensions/store/item-catalog";
import {
  installItem,
  uninstallItem,
  updateItem,
  updateAllItems,
  getInstalledItems,
  deleteUntracked,
} from "../../extensions/store/item-lifecycle";
import { getStoreDir } from "../../extensions/store/persistence";
import {
  resolveScreenshotPath,
  resolveRepoAssetPath,
} from "../../extensions/store/asset-paths";
import { ExtensionStoreType } from "../../types/extension";
import { logger } from "../../utils/logger";
import { settingsAuth } from "../_guards";
import { buildSignedProxyUrl, proxyMarkdownImages } from "../../utils/net/proxy-sign";
import type { RepoInfo } from "../../types/store";
import { CSP_HEADER, SVG_CSP } from "../../utils/security/content-policy";
import { eventStream, type SseSend } from "../../utils/net/event-stream";

const router = new Hono();

const STORE_STREAM_NS = "store:stream";

function _reportStoreFailure(err: unknown, send: SseSend): void {
  const message = err instanceof Error ? err.message : "Operation failed";
  logger.warn(STORE_STREAM_NS, `store progress stream failed: ${message}`);
  send("failed", { error: message });
}

const streamStoreProgress = (
  signal: AbortSignal,
  run: (send: SseSend) => Promise<void>,
): Response => eventStream(signal, STORE_STREAM_NS, run, _reportStoreFailure);

const VALID_TYPES: ExtensionStoreType[] = Object.values(ExtensionStoreType);

function isValidType(type: string): type is ExtensionStoreType {
  return (VALID_TYPES as readonly string[]).includes(type);
}

function getStoreItemPath(type: ExtensionStoreType, item: string): string {
  switch (type) {
    case ExtensionStoreType.Plugin:
      return `plugins/${item}`;
    case ExtensionStoreType.Theme:
      return `themes/${item}`;
    case ExtensionStoreType.Transport:
      return `transports/${item}`;
    case ExtensionStoreType.Autocomplete:
      return `autocomplete/${item}`;
    case ExtensionStoreType.Shortcut:
      return `shortcuts/${item}`;
    case ExtensionStoreType.Favicon:
      return `favicon/${item}`;
    case ExtensionStoreType.Engine:
      return `engines/${item}`;
  }
}

const _withProxiedImage = (repo: RepoInfo): RepoInfo =>
  repo.repoImage && /^https?:\/\//i.test(repo.repoImage)
    ? { ...repo, repoImage: buildSignedProxyUrl(repo.repoImage) }
    : repo;

router.get("/api/store/repos", settingsAuth(), async (c) => {
  const repos = await getRepos();
  return c.json({ repos: repos.map(_withProxiedImage), globalBeta: isGlobalBetaStore() });
});

router.get("/api/store/repos/:repoSlug/asset", settingsAuth(), async (c) => {
  const repoSlug = c.req.param("repoSlug");
  const pathParam = c.req.query("path");
  if (!pathParam?.trim()) return c.json({ error: "Missing path" }, 400);
  const resolved = resolveRepoAssetPath(repoSlug, pathParam.trim());
  if (!resolved || !existsSync(resolved)) {
    return c.json({ error: "Not found" }, 404);
  }
  const file = Bun.file(resolved);
  const ext = resolved.toLowerCase().slice(resolved.lastIndexOf("."));
  const contentType =
    ext === ".svg"
      ? "image/svg+xml"
      : ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";
  return c.body(await file.arrayBuffer(), 200, {
    "Content-Type": contentType,
    ...(ext === ".svg" ? { [CSP_HEADER]: SVG_CSP } : {}),
  });
});

router.get("/api/store/repos/status", settingsAuth(), async (c) => {
  const statuses = await getReposStatus();
  return c.json({ statuses });
});

router.post("/api/store/repos", settingsAuth(), async (c) => {
  const body = await readObjectBody<{ url?: string }>(c);
  const url = body?.url?.trim();
  if (!url) return c.json({ error: "Missing url" }, 400);
  try {
    const repo = await addRepo(url);
    return c.json(repo);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add repository";
    return c.json({ error: message }, 400);
  }
});

router.delete("/api/store/repos", settingsAuth(), async (c) => {
  const body = await readObjectBody<{ url?: string }>(c);
  const url = body?.url?.trim();
  if (!url) return c.json({ error: "Missing url" }, 400);
  try {
    await removeRepo(url);
    return c.json({ ok: true });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to remove repository";
    return c.json({ error: message }, 400);
  }
});

router.post("/api/store/repos/beta", settingsAuth(), async (c) => {
  const body = await readObjectBody<{ url?: string; beta?: unknown }>(c);
  const url = body?.url?.trim();
  if (!url || typeof body?.beta !== "boolean") {
    return c.json({ error: "Missing url or beta flag" }, 400);
  }
  try {
    const repo = await setRepoBeta(url, body.beta);
    return c.json(_withProxiedImage(repo));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to switch branch";
    return c.json({ error: message }, 400);
  }
});

router.post("/api/store/repos/refresh", settingsAuth(), async (c) => {
  const body = await readObjectBody<{ url?: string }>(c);
  const url = body?.url?.trim();
  try {
    if (url) {
      await refreshRepo(url);
      return c.json({ ok: true });
    }
    const results = await refreshAllRepos();
    return c.json({ ok: true, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Refresh failed";
    return c.json({ error: message }, 400);
  }
});

const _withProxiedDescription = <T extends { description?: string }>(item: T): T =>
  item.description ? { ...item, description: proxyMarkdownImages(item.description) } : item;

router.get("/api/store/items", settingsAuth(), async (c) => {
  const items = await listRepoItems();
  return c.json({ items: items.map(_withProxiedDescription) });
});

router.get("/api/store/items/:repoSlug", settingsAuth(), async (c) => {
  const repoSlug = c.req.param("repoSlug");
  const repos = await getRepos();
  const repo = repos.find((r) => r.localPath === repoSlug);
  if (!repo) return c.json({ error: "Repository not found" }, 404);
  const items = await listRepoItems(repo.url);
  return c.json({ items: items.map(_withProxiedDescription) });
});

const itemAction =
  (
    action: (repoUrl: string, itemPath: string, type: ExtensionStoreType) => Promise<void>,
    failure: string,
  ) =>
  async (c: Context) => {
    const { repoUrl, itemPath, type } =
      (await readObjectBody<{ repoUrl?: string; itemPath?: string; type?: string }>(c)) ?? {};
    if (!repoUrl?.trim() || !itemPath?.trim() || !type) {
      return c.json({ error: "Missing repoUrl, itemPath, or type" }, 400);
    }
    if (!isValidType(type)) {
      return c.json({ error: "Invalid type" }, 400);
    }
    try {
      await action(repoUrl.trim(), itemPath.trim(), type);
      return c.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : failure;
      return c.json({ error: message }, 400);
    }
  };

router.post("/api/store/install", settingsAuth(), itemAction((...args) => installItem(...args), "Install failed"));

router.post("/api/store/uninstall", settingsAuth(), itemAction((...args) => uninstallItem(...args), "Uninstall failed"));

router.post("/api/store/update", settingsAuth(), itemAction((...args) => updateItem(...args), "Update failed"));

router.post("/api/store/update-all", settingsAuth(), async (c) => {
  try {
    const result = await updateAllItems();
    return c.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return c.json({ error: message }, 400);
  }
});

router.get("/api/store/update-all/stream", settingsAuth(), async (c) => {
  return streamStoreProgress(c.req.raw.signal, async (send) => {
    const result = await updateAllItems((p) => send("item", p));
    send("done", result);
  });
});

router.get("/api/store/repos/refresh/stream", settingsAuth(), async (c) => {
  return streamStoreProgress(c.req.raw.signal, async (send) => {
    const results = await refreshAllRepos((p) => send("repo", p));
    const failed = results.filter((r) => r.error).length;
    send("done", { refreshed: results.length - failed, failed });
  });
});

router.delete("/api/store/untracked", settingsAuth(), async (c) => {
  const { type, folderName } =
    (await readObjectBody<{ type?: string; folderName?: string }>(c)) ?? {};
  if (!type || !folderName?.trim()) {
    return c.json({ error: "Missing type or folderName" }, 400);
  }
  if (!isValidType(type)) {
    return c.json({ error: "Invalid type" }, 400);
  }
  try {
    await deleteUntracked(type, folderName.trim());
    return c.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return c.json({ error: message }, 400);
  }
});

router.get("/api/store/installed", settingsAuth(), async (c) => {
  const installed = await getInstalledItems();
  return c.json({ installed });
});

router.get(
  "/api/store/screenshots/:repoSlug/:type/:item/:filename",
  settingsAuth(),
  async (c) => {
    const repoSlug = c.req.param("repoSlug");
    const typeParam = c.req.param("type");
    if (!isValidType(typeParam)) {
      return c.json({ error: "Invalid type" }, 400);
    }
    const type = typeParam;
    const item = c.req.param("item");
    const filename = c.req.param("filename");
    const itemPath = getStoreItemPath(type, item);
    const resolved = resolveScreenshotPath(repoSlug, itemPath, filename);
    if (!resolved || !existsSync(resolved)) {
      return c.json({ error: "Not found" }, 404);
    }
    const storeDir = getStoreDir();
    const base = resolve(storeDir, repoSlug);
    const rel = relative(base, resolved);
    if (rel.startsWith("..") || rel.includes("..")) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const file = Bun.file(resolved);
    const contentType = filename.endsWith(".png")
      ? "image/png"
      : filename.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return c.body(await file.arrayBuffer(), 200, {
      "Content-Type": contentType,
    });
  },
);

export default router;
