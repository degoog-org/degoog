import type { RequestMiddleware, Translate } from "../../types";
import { registerPluginNamespace } from "../../utils/plugin-assets";
import { createTranslatorFromPath } from "../../utils/translation";
import { pluginsDir } from "../../utils/paths";
import { createRegistry } from "../registry-factory";

function isRequestMiddleware(val: unknown): val is RequestMiddleware {
  if (typeof val !== "object" || val === null) return false;
  const m = val as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.name === "string" &&
    typeof m.handle === "function"
  );
}

const registry = createRegistry<RequestMiddleware>({
  dirs: () => [{ dir: pluginsDir(), source: "plugin" }],
  match: (mod) => {
    const m =
      mod.middleware ?? (mod.default as Record<string, unknown>)?.middleware;
    return isRequestMiddleware(m) ? m : null;
  },
  onLoad: async (m, { entryPath, folderName }) => {
    m.t = await createTranslatorFromPath(entryPath);
    registerPluginNamespace(folderName, `middleware/${m.id}`);
  },
  debugTag: "middleware",
});

export async function initMiddlewareRegistry(): Promise<void> {
  await registry.init();
}

export function getMiddleware(id: string): RequestMiddleware | null {
  return registry.items().find((m) => m.id === id) ?? null;
}

export async function reloadMiddlewareRegistry(): Promise<void> {
  await registry.reload();
}

export function getAllMiddlewareTranslators(): {
  namespace: string;
  translator: Translate;
}[] {
  return registry
    .items()
    .filter((m) => !!m.t)
    .map((m) => ({ namespace: `middleware/${m.id}`, translator: m.t! }));
}
