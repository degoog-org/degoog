import { stat } from "fs/promises";
import { join } from "path";
import type { Uovadipasqua, UovadipasquaMatch } from "../../types";
import { createRegistry } from "../registry-factory";
import { getBasePath } from "../../utils/base-url";
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

const _isUovadipasqua = (val: unknown): val is Uovadipasqua => {
  if (typeof val !== "object" || val === null) return false;
  const egg = val as Uovadipasqua;
  return (
    typeof egg.id === "string" &&
    Array.isArray(egg.triggers) &&
    egg.triggers.every(
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
  onLoad: async (egg, { entryPath, folderName, canonicalId }) => {
    const legacyId = egg.id;
    const id = canonicalId ?? folderName;
    egg.id = id;
    _entryPaths.set(id, entryPath);
    if (legacyId && legacyId !== id) _entryPaths.delete(legacyId);
    const styleStat = await stat(join(entryPath, "style.css")).catch(
      () => null,
    );
    _hasStyle.set(id, !!styleStat?.isFile());
  },
  debugTag: "uovadipasqua",
});

export async function initUovadipasquas(): Promise<void> {
  _entryPaths.clear();
  _hasStyle.clear();
  await registry.init();
}

export function getUovadipasquaAssetPath(
  id: string,
  filename: "script.js" | "style.css",
): string | null {
  const dir = _entryPaths.get(id);
  if (!dir) return null;
  if (filename === "style.css" && !_hasStyle.get(id)) return null;
  return join(dir, filename);
}

const _normalize = (query: string): string => query.trim().toLowerCase();

export const matchSearchQueryEggs = (query: string): UovadipasquaMatch[] => {
  const normalized = _normalize(query);
  if (!normalized) return [];
  const matches: UovadipasquaMatch[] = [];
  for (const egg of registry.items()) {
    if (!egg.id) {
      const patterns = egg.triggers
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
    const trigger = egg.triggers.find(
      (t) =>
        t.type === "search-query" && t.pattern.toLowerCase() === normalized,
    );
    if (!trigger) continue;
    if (typeof trigger.chance === "number" && Math.random() > trigger.chance) {
      continue;
    }
    const basePath = getBasePath();
    matches.push({
      id: egg.id,
      scriptUrl: `${basePath}/uovadipasqua/${egg.id}/script.js`,
      styleUrl: _hasStyle.get(egg.id)
        ? `${basePath}/uovadipasqua/${egg.id}/style.css`
        : null,
      waitForResults: !!egg.waitForResults,
    });
  }
  return matches;
};
