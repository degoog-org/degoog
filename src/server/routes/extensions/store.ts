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
} from "../../extensions/store/repo-ops";
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

const router = new Hono();

type SseSend = (event: string, data: unknown) => void;

function streamStoreProgress(
  signal: AbortSignal,
  run: (send: SseSend) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send: SseSend = (event, data) => {
        if (closed || signal.aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch (err) {
          logger.debug("store:stream", "client disconnected", err);
          closed = true;
        }
      };
      try {
        await run(send);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Operation failed";
        logger.warn("store:stream", `store progress stream failed: ${message}`);
        send("failed", { error: message });
      } finally {
        if (!closed) controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

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
    case ExtensionStoreType.Engine:
      return `engines/${item}`;
  }
}

router.get("/api/store/repos", settingsAuth(), async (c) => {
  const repos = await getRepos();
  return c.json({ repos });
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

router.get("/api/store/items", settingsAuth(), async (c) => {
  const items = await listRepoItems();
  return c.json({ items });
});

router.get("/api/store/items/:repoSlug", settingsAuth(), async (c) => {
  const repoSlug = c.req.param("repoSlug");
  const repos = await getRepos();
  const repo = repos.find((r) => r.localPath === repoSlug);
  if (!repo) return c.json({ error: "Repository not found" }, 404);
  const items = await listRepoItems(repo.url);
  return c.json({ items });
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
