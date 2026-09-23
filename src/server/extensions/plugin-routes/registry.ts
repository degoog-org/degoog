import { readdir, stat } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import type { PluginRoute } from "../../types/extension";
import { logger } from "../../utils/logger";
import { pluginsDir } from "../../utils/paths";
import { bootCircuitFromPath } from "../../utils/extension-support/translation-circuit";
import { getPluginRegistryReloadGeneration } from "../registry-factory";

interface RouteEntry {
  pluginId: string;
  routes: PluginRoute[];
}

const _entries: RouteEntry[] = [];
const _registeredFolders = new Set<string>();

const INDEX_FILES = ["index.js", "index.ts", "index.mjs", "index.cjs"];

function isPluginRoute(val: unknown): val is PluginRoute {
  if (typeof val !== "object" || val === null) return false;
  const r = val as Record<string, unknown>;
  return (
    typeof r.method === "string" &&
    ["get", "post", "put", "delete", "patch"].includes(r.method as string) &&
    typeof r.path === "string" &&
    typeof r.handler === "function"
  );
}

const normalizePath = (p: string): string => {
  const s = p.trim().replace(/^\/+/, "").replace(/\/+$/, "") || "";
  return s ? `/${s}` : "/";
};

const extractRoutes = (mod: Record<string, unknown>): PluginRoute[] => {
  const routes =
    mod.routes ?? (mod.default as Record<string, unknown> | undefined)?.routes;
  if (
    !Array.isArray(routes) ||
    !(routes as unknown[]).every(isPluginRoute) ||
    routes.length === 0
  ) {
    return [];
  }
  return (routes as PluginRoute[]).map((r) => ({
    ...r,
    path: normalizePath(r.path),
  }));
};

async function resolvePluginEntry(
  rootDir: string,
  entryName: string,
): Promise<{ fullPath: string; base: string } | null> {
  const fullEntry = join(rootDir, entryName);
  const entryStat = await stat(fullEntry).catch(() => null);
  if (!entryStat?.isDirectory()) return null;
  for (const f of INDEX_FILES) {
    const s = await stat(join(fullEntry, f)).catch(() => null);
    if (s?.isFile()) return { fullPath: join(fullEntry, f), base: entryName };
  }
  return null;
}

export const clearPluginRoutes = (): void => {
  _entries.length = 0;
  _registeredFolders.clear();
};

export const registerPluginRoutesFromModule = async (
  folderName: string,
  entryPath: string,
  mod: Record<string, unknown>,
): Promise<void> => {
  if (_registeredFolders.has(folderName)) return;
  const routes = extractRoutes(mod);
  if (routes.length === 0) return;
  const t = await bootCircuitFromPath(entryPath);
  for (const route of routes) {
    route.t = t;
  }
  _registeredFolders.add(folderName);
  _entries.push({ pluginId: folderName, routes });
};

export async function initPluginRoutes(bust = false): Promise<void> {
  const dir = pluginsDir();
  let entries: string[];
  try {
    entries = (await readdir(dir)).sort((a, b) => a.localeCompare(b));
  } catch (err) {
    logger.debug("plugin-routes", `plugins dir read failed ${dir}`, err);
    return;
  }
  for (const entryName of entries) {
    const resolved = await resolvePluginEntry(dir, entryName);
    if (!resolved) continue;
    try {
      const href = pathToFileURL(resolved.fullPath).href;
      const url = bust
        ? `${href}?r=${getPluginRegistryReloadGeneration()}`
        : href;
      const mod = (await import(url)) as Record<string, unknown>;
      await registerPluginRoutesFromModule(
        resolved.base,
        join(dir, resolved.base),
        mod,
      );
    } catch (err) {
      logger.debug("plugin-routes", `Failed to import: ${entryName}`, err);
    }
  }
}

export function resolvePluginFolderId(requestedId: string): string {
  if (_entries.some((e) => e.pluginId === requestedId)) return requestedId;
  const legacy = _entries.find((e) => e.pluginId.endsWith(`-${requestedId}`));
  return legacy?.pluginId ?? requestedId;
}

export function findPluginRoute(
  pluginId: string,
  method: string,
  path: string,
): PluginRoute | null {
  const resolved = resolvePluginFolderId(pluginId);
  const entry = _entries.find((e) => e.pluginId === resolved);
  if (!entry) return null;
  const normalized = path.replace(/^\/+/, "").replace(/\/+$/, "") || "";
  const want = normalized ? `/${normalized}` : "/";
  return (
    entry.routes.find(
      (r) => r.method === method.toLowerCase() && r.path === want,
    ) ?? null
  );
}
