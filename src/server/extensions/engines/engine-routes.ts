import type { PluginRoute } from "../../types/extension";
import { getBasePath } from "../../utils/net/base-url";
import { isDisabled } from "../../utils/settings/plugin-settings";
import { allEngineEntries } from "./loader";
import type { PluginEntry } from "./entries";

export const ENGINE_ROUTE_PREFIX = "/api/engine";

const ROUTE_PATH_RE = /^\/[\w.~-]+(?:\/[\w.~-]+)*$/;

const _withRoutes = (): PluginEntry[] =>
  allEngineEntries().filter(
    (e): e is PluginEntry =>
      typeof (e as PluginEntry).folder === "string" &&
      ((e as PluginEntry).routes?.length ?? 0) > 0,
  );

export const findEngineRouteEntry = (folder: string): PluginEntry | null =>
  _withRoutes().find((e) => e.folder === folder) ?? null;

export const findEngineRoute = (
  entry: PluginEntry,
  method: string,
  path: string,
): PluginRoute | null => {
  const normalized = path.replace(/^\/+/, "").replace(/\/+$/, "") || "";
  const want = normalized ? `/${normalized}` : "/";
  return (
    entry.routes?.find(
      (r) => r.method === method.toLowerCase() && r.path === want,
    ) ?? null
  );
};

export const engineRouteBase = (engineId: string | undefined): string | undefined => {
  if (!engineId) return undefined;
  const entry = _withRoutes().find((e) => e.id === engineId);
  return entry?.folder
    ? `${getBasePath()}${ENGINE_ROUTE_PREFIX}/${entry.folder}`
    : undefined;
};

export const engineRouteUrl = (base: string, path: string): string => {
  const [rawPath, query] = path.split(/\?(.*)/s, 2);
  const clean = `/${rawPath.replace(/^\/+/, "")}`;
  if (!ROUTE_PATH_RE.test(clean) || clean.split("/").some((seg) => seg === "." || seg === "..")) {
    throw new Error(`invalid engine route path: ${path}`);
  }
  return `${base}${clean}${query ? `?${query}` : ""}`;
};

const INTERNAL_ORIGIN = "http://degoog.internal";

const _ownRoute = (url: string): { folder: string; suffix: string } | null => {
  const prefix = `${getBasePath()}${ENGINE_ROUTE_PREFIX}/`;
  if (!url.startsWith(prefix)) return null;
  const [path] = url.slice(prefix.length).split("?", 1);
  const [folder, ...rest] = path.split("/");
  const suffix = `/${rest.join("/")}`;
  if (!folder || !ROUTE_PATH_RE.test(`/${folder}`) || !ROUTE_PATH_RE.test(suffix)) return null;
  if (suffix.split("/").some((seg) => seg === "." || seg === "..")) return null;
  return { folder, suffix };
};

export const isEngineRouteUrl = (url: string): boolean => _ownRoute(url) !== null;

export const fetchEngineRoute = async (url: string): Promise<Response | null> => {
  const own = _ownRoute(url);
  if (!own) return null;
  const entry = findEngineRouteEntry(own.folder);
  if (!entry || (await isDisabled(entry.id))) return null;
  const route = findEngineRoute(entry, "get", own.suffix);
  if (!route) return null;
  return route.handler(new Request(`${INTERNAL_ORIGIN}${url}`));
};
