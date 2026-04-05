import type { PluginRoute } from "../../types";
import { createTranslatorFromPath } from "../../utils/translation";
import { pluginsDir } from "../../utils/paths";
import { createRegistry } from "../registry-factory";

interface RouteEntry {
  pluginId: string;
  routes: PluginRoute[];
}

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

function normalizePath(p: string): string {
  const s = p.trim().replace(/^\/+/, "").replace(/\/+$/, "") || "";
  return s ? `/${s}` : "/";
}

const registry = createRegistry<RouteEntry>({
  dirs: () => [{ dir: pluginsDir(), source: "plugin" }],
  match: (mod) => {
    const routes =
      mod.routes ?? (mod.default as Record<string, unknown>)?.routes;
    if (
      !Array.isArray(routes) ||
      !(routes as unknown[]).every(isPluginRoute) ||
      routes.length === 0
    )
      return null;
    return {
      pluginId: "",
      routes: (routes as PluginRoute[]).map((r) => ({
        ...r,
        path: normalizePath(r.path),
      })),
    };
  },
  onLoad: async (entry, { entryPath, folderName }) => {
    entry.pluginId = folderName;
    const t = await createTranslatorFromPath(entryPath);
    for (const route of entry.routes) {
      route.t = t;
    }
  },
  debugTag: "plugin-routes",
});

export async function initPluginRoutes(): Promise<void> {
  await registry.init();
}

export function getPluginRoutes(pluginId: string): PluginRoute[] {
  return [
    ...(registry.items().find((e) => e.pluginId === pluginId)?.routes ?? []),
  ];
}

export function findPluginRoute(
  pluginId: string,
  method: string,
  path: string,
): PluginRoute | null {
  const entry = registry.items().find((e) => e.pluginId === pluginId);
  if (!entry) return null;
  const normalized = path.replace(/^\/+/, "").replace(/\/+$/, "") || "";
  const want = normalized ? `/${normalized}` : "/";
  return (
    entry.routes.find(
      (r) => r.method === method.toLowerCase() && r.path === want,
    ) ?? null
  );
}

export async function reloadPluginRoutes(): Promise<void> {
  await registry.reload();
}
