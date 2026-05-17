import { stat } from "fs/promises";
import { join } from "path";
import type {
  Uovadipasqua,
  UovadipasquaClientStorageBinding,
  UovadipasquaMatch,
  PluginRoute,
  PluginRouteMethod,
} from "../../types";
import { createRegistry } from "../registry-factory";
import { getBasePath } from "../../utils/base-url";
import { buildSignedProxyUrl } from "../../utils/proxy-sign";
import { logger } from "../../utils/logger";

const builtinsDir = join(
  process.cwd(),
  "src",
  "server",
  "extensions",
  "uovadipasqua",
);

const _entryPaths = new Map<string, string>();
const _hasStyle = new Map<string, boolean>();
const _routes = new Map<string, PluginRoute[]>();

const VALID_METHODS: PluginRouteMethod[] = ["get", "post", "put", "delete", "patch"];

const _normalizePath = (p: string): string => {
  const s = p.trim().replace(/^\/+/, "").replace(/\/+$/, "") || "";
  return s ? `/${s}` : "/";
};

const _isValidRoute = (r: unknown): r is PluginRoute => {
  if (typeof r !== "object" || r === null) return false;
  const route = r as Record<string, unknown>;
  return (
    VALID_METHODS.includes(route.method as PluginRouteMethod) &&
    typeof route.path === "string" &&
    typeof route.handler === "function"
  );
};

const _isUovadipasqua = (val: unknown): val is Uovadipasqua => {
  if (typeof val !== "object" || val === null) return false;
  const item = val as Uovadipasqua;
  return (
    typeof item.id === "string" &&
    Array.isArray(item.triggers) &&
    item.triggers.every(
      (t) => t.type === "search-query" && typeof t.pattern === "string",
    )
  );
};

const registry = createRegistry<Uovadipasqua>({
  dirs: () => [{ dir: builtinsDir, source: "builtin" }],
  match: (mod) => {
    const val =
      mod.uovadipasqua ??
      mod.default ??
      (mod.default as Record<string, unknown> | undefined)?.uovadipasqua;
    return _isUovadipasqua(val) ? val : null;
  },
  canonicalIdKind: "uovadipasqua",
  onLoad: async (item, { entryPath, folderName, canonicalId }) => {
    const legacyId = item.id;
    const id = canonicalId ?? folderName;
    item.id = id;
    _entryPaths.set(id, entryPath);
    if (legacyId && legacyId !== id) {
      _entryPaths.delete(legacyId);
      _routes.delete(legacyId);
    }
    const styleStat = await stat(join(entryPath, "style.css")).catch(
      () => null,
    );
    _hasStyle.set(id, !!styleStat?.isFile());
    const raw = item.routes;
    if (Array.isArray(raw) && raw.every(_isValidRoute)) {
      _routes.set(id, raw.map((r) => ({ ...r, path: _normalizePath(r.path) })));
    } else {
      _routes.delete(id);
    }
  },
  debugTag: "uovadipasqua",
});

export async function initUovadipasquas(): Promise<void> {
  _entryPaths.clear();
  _hasStyle.clear();
  _routes.clear();
  await registry.init();
}

export function findUovadipasquaRoute(
  id: string,
  method: string,
  path: string,
): PluginRoute | null {
  const routes = _routes.get(id);
  if (!routes) return null;
  const normalized = _normalizePath(path);
  return (
    routes.find(
      (r) => r.method === method.toLowerCase() && r.path === normalized,
    ) ?? null
  );
}

const ALLOWED_ASSETS = /^[\w.-]+\.(js|css|png|jpg|jpeg|gif|webp|svg)$/;

export function getUovadipasquaAssetPath(
  id: string,
  filename: string,
): string | null {
  if (!ALLOWED_ASSETS.test(filename)) return null;
  const dir = _entryPaths.get(id);
  if (!dir) return null;
  if (filename === "style.css" && !_hasStyle.get(id)) return null;
  return join(dir, filename);
}

const _normalize = (query: string): string => query.trim().toLowerCase();

const _styleUrl = (id: string): string | undefined => {
  if (!_hasStyle.get(id)) return undefined;
  return `${getBasePath()}/uovadipasqua/${id}/style.css`;
};

const _buildAssets = (
  item: Uovadipasqua,
): Record<string, string> | undefined => {
  if (!item.proxyImages || Object.keys(item.proxyImages).length === 0) return undefined;
  return Object.fromEntries(
    Object.entries(item.proxyImages).map(([key, url]) => [key, buildSignedProxyUrl(url)]),
  );
};

const _clientStorageBindingFor = (
  item: Uovadipasqua,
): UovadipasquaClientStorageBinding | undefined => {
  if (!item.id || !item.clientStorage) return undefined;
  const hasRoutes = (_routes.get(item.id)?.length ?? 0) > 0;
  return {
    extensionId: item.id,
    styleUrl: _styleUrl(item.id),
    localStorageKey: item.clientStorage.localStorageKey,
    ...(hasRoutes ? { apiBase: `${getBasePath()}/api/uovadipasqua/${item.id}` } : {}),
  };
};

export const matchUovadipasqua = (query: string): UovadipasquaMatch[] => {
  const normalized = _normalize(query);
  if (!normalized) return [];
  const matches: UovadipasquaMatch[] = [];
  for (const item of registry.items()) {
    if (!item.id) {
      const patterns = item.triggers
        .map((t) => t.pattern)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");
      logger.warn(
        "uovadipasqua",
        `Skipping extension: missing id (patterns="${patterns}")`,
      );
      continue;
    }
    const trigger = item.triggers.find(
      (t) =>
        t.type === "search-query" && t.pattern.toLowerCase() === normalized,
    );
    if (!trigger) continue;
    if (typeof trigger.chance === "number" && Math.random() > trigger.chance) {
      continue;
    }
    const basePath = getBasePath();
    const hasRoutes = (_routes.get(item.id)?.length ?? 0) > 0;
    matches.push({
      id: item.id,
      scriptUrl: `${basePath}/uovadipasqua/${item.id}/script.js`,
      styleUrl: _styleUrl(item.id),
      waitForResults: !!item.waitForResults,
      repeatOnQuery: !!item.repeatOnQuery,
      assets: _buildAssets(item),
      ...(hasRoutes ? { apiBase: `${basePath}/api/uovadipasqua/${item.id}` } : {}),
    });
  }
  return matches;
};

export function listUovadipasquaClientStorageBindings(): UovadipasquaClientStorageBinding[] {
  const out: UovadipasquaClientStorageBinding[] = [];
  const seen = new Set<string>();
  for (const item of registry.items()) {
    const b = _clientStorageBindingFor(item);
    if (!b) continue;
    const dedupe = b.extensionId;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(b);
  }
  return out;
}
