import { Context, Hono } from "hono";
import { existsSync } from "fs";
import { validateSettingsToken } from "./settings-auth";
import { resolve, relative } from "path";

import {
  getRepos,
  getReposStatus,
  addRepo,
  removeRepo,
  refreshRepo,
  refreshAllRepos,
  listRepoItems,
  installItem,
  uninstallItem,
  updateItem,
  updateAllItems,
  getInstalledItems,
  getStoreDirPath,
  resolveScreenshotPath,
  resolveRepoAssetPath,
} from "../extensions/store/repo-manager";
import { ExtensionStoreType } from "../types";

const router = new Hono();

function getStoreToken(c: Context): string | undefined {
  return c.req.header("x-settings-token") ?? c.req.query("token");
}

const VALID_TYPES: ExtensionStoreType[] = Object.values(ExtensionStoreType);

function isValidType(type: string): type is ExtensionStoreType {
  return (VALID_TYPES as readonly string[]).includes(type);
}

router.get("/api/store/repos", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
  const repos = await getRepos();
  return c.json({ repos });
});

router.get("/api/store/repos/:repoSlug/asset", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
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

router.get("/api/store/repos/status", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
  const statuses = await getReposStatus();
  return c.json({ statuses });
});

router.post("/api/store/repos", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json<{ url?: string }>();
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

router.delete("/api/store/repos", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
  const body = (await c.req.json<{ url?: string }>().catch(() => ({}))) as {
    url?: string;
  };
  const url = body.url?.trim();
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

router.post("/api/store/repos/refresh", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
  const body = (await c.req.json<{ url?: string }>().catch(() => ({}))) as {
    url?: string;
  };
  const url = body.url?.trim();
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

router.get("/api/store/items", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
  const items = await listRepoItems();
  return c.json({ items });
});

router.get("/api/store/items/:repoSlug", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
  const repoSlug = c.req.param("repoSlug");
  const repos = await getRepos();
  const repo = repos.find((r) => r.localPath === repoSlug);
  if (!repo) return c.json({ error: "Repository not found" }, 404);
  const items = await listRepoItems(repo.url);
  return c.json({ items });
});

router.post("/api/store/install", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json<{
    repoUrl?: string;
    itemPath?: string;
    type?: string;
  }>();
  const { repoUrl, itemPath, type } = body ?? {};
  if (!repoUrl?.trim() || !itemPath?.trim() || !type) {
    return c.json({ error: "Missing repoUrl, itemPath, or type" }, 400);
  }
  if (!isValidType(type)) {
    return c.json({ error: "Invalid type" }, 400);
  }
  try {
    await installItem(repoUrl.trim(), itemPath.trim(), type);
    return c.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Install failed";
    return c.json({ error: message }, 400);
  }
});

router.post("/api/store/uninstall", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json<{
    repoUrl?: string;
    itemPath?: string;
    type?: string;
  }>();
  const { repoUrl, itemPath, type } = body ?? {};
  if (!repoUrl?.trim() || !itemPath?.trim() || !type) {
    return c.json({ error: "Missing repoUrl, itemPath, or type" }, 400);
  }
  if (!isValidType(type)) {
    return c.json({ error: "Invalid type" }, 400);
  }
  try {
    await uninstallItem(repoUrl.trim(), itemPath.trim(), type);
    return c.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Uninstall failed";
    return c.json({ error: message }, 400);
  }
});

router.post("/api/store/update", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json<{
    repoUrl?: string;
    itemPath?: string;
    type?: string;
  }>();
  const { repoUrl, itemPath, type } = body ?? {};
  if (!repoUrl?.trim() || !itemPath?.trim() || !type) {
    return c.json({ error: "Missing repoUrl, itemPath, or type" }, 400);
  }
  if (!isValidType(type)) {
    return c.json({ error: "Invalid type" }, 400);
  }
  try {
    await updateItem(repoUrl.trim(), itemPath.trim(), type);
    return c.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return c.json({ error: message }, 400);
  }
});

router.post("/api/store/update-all", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
  try {
    const result = await updateAllItems();
    return c.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return c.json({ error: message }, 400);
  }
});

router.get("/api/store/installed", async (c) => {
  if (!(await validateSettingsToken(getStoreToken(c))))
    return c.json({ error: "Unauthorized" }, 401);
  const installed = await getInstalledItems();
  return c.json({ installed });
});

router.get(
  "/api/store/screenshots/:repoSlug/:type/:item/:filename",
  async (c) => {
    if (!(await validateSettingsToken(getStoreToken(c))))
      return c.json({ error: "Unauthorized" }, 401);
    const repoSlug = c.req.param("repoSlug");
    const typeParam = c.req.param("type");
    if (!isValidType(typeParam)) {
      return c.json({ error: "Invalid type" }, 400);
    }
    const type = typeParam;
    const item = c.req.param("item");
    const filename = c.req.param("filename");
    const itemPath =
      type === ExtensionStoreType.Plugin
        ? `plugins/${item}`
        : type === ExtensionStoreType.Theme
          ? `themes/${item}`
          : type === ExtensionStoreType.Transport
            ? `transports/${item}`
            : `engines/${item}`;
    const resolved = resolveScreenshotPath(repoSlug, itemPath, filename);
    if (!resolved || !existsSync(resolved)) {
      return c.json({ error: "Not found" }, 404);
    }
    const storeDir = getStoreDirPath();
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
