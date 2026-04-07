/**
 * @fccview here!
 * Sorry for the comment spam, it's a CORE piece of functionality and should be well documented.
 * If developers decide to create new registries and make pull requests I'd rather them know exactly how to semantically do it.
 */

import { join } from "path";
import { readdir, stat } from "fs/promises";
import { pathToFileURL } from "url";
import { debug } from "../utils/logger";

/**
 * A directory to scan for extensions, along with its source label.
 *
 * @example
 * { dir: pluginsDir(), source: "plugin" }
 * { dir: join(process.cwd(), "src/server/extensions/commands/builtins"), source: "builtin" }
 */
export interface RegistryDir {
  dir: string;
  source: "plugin" | "builtin";
}

/**
 * Metadata passed to `onLoad` after an extension is successfully extracted and validated.
 */
export interface RegistryLoadMeta {
  /** Absolute path to the extension's folder (or file for flat-file extensions). */
  entryPath: string;
  /** Folder or base filename, used as the extension's natural ID. */
  folderName: string;
  source: "plugin" | "builtin";
}

/**
 * Configuration for `createRegistry`.
 *
 * @template T The extension type this registry manages.
 *
 * @example
 * // Minimal registry (no assets, no settings)
 * createRegistry<RequestMiddleware>({
 *   dirs: () => [{ dir: pluginsDir(), source: "plugin" }],
 *   match: (mod) => {
 *     const m = mod.middleware ?? (mod.default as Record<string, unknown>)?.middleware;
 *     return isRequestMiddleware(m) ? m : null;
 *   },
 *   debugTag: "middleware",
 * });
 *
 * @example
 * // Registry with asset loading in onLoad
 * createRegistry<SlotPlugin>({
 *   dirs: () => [{ dir: pluginsDir(), source: "plugin" }],
 *   match: (mod) => {
 *     const s = mod.slot ?? mod.slotPlugin ?? (mod.default as Record<string, unknown>)?.slot;
 *     return isSlotPlugin(s) ? s : null;
 *   },
 *   onLoad: async (slot, { entryPath, folderName, source }) => {
 *     const settingsId = slot.settingsId ?? `slot-${slot.id}`;
 *     registerPluginSettingsId(folderName, settingsId);
 *     if (!(await isDisabled(settingsId))) {
 *       const template = await loadPluginAssets(entryPath, folderName, settingsId, source);
 *       await initPlugin(slot, entryPath, settingsId, template);
 *     }
 *   },
 *   debugTag: "slots",
 * });
 */
export interface RegistryOptions<T> {
  /**
   * One or more directories to scan. Can be a static array or a function
   * evaluated on each `init()` call (use a function when the path depends
   * on env vars that may not be set at module load time).
   */
  dirs: RegistryDir[] | (() => RegistryDir[]);
  /**
   * Extract and validate an extension from a loaded module's exports.
   * Return the typed value if the module contains a valid extension, or `null` to skip it.
   *
   * @example
   * match: (mod) => {
   *   const val = mod.default ?? mod.command;
   *   return isMyExtension(val) ? val : null;
   * }
   */
  match(mod: Record<string, unknown>): T | null;
  /**
   * Optional hook called after a valid item is extracted, before it is
   * added to the registry. Use this for settings init, asset loading,
   * or mutating the entry (e.g. assigning its `id`).
   */
  onLoad?(item: T, meta: RegistryLoadMeta): Promise<void>;
  /**
   * When `true`, plain `.js/.ts/.mjs/.cjs` files in the directory are
   * loaded in addition to `index.*` files inside subdirectories.
   * Used by the engines and transports registries.
   */
  allowFlatFiles?: boolean;
  /** Label used in debug log messages. */
  debugTag: string;
}

const INDEX_FILES = ["index.js", "index.ts", "index.mjs", "index.cjs"];
const FLAT_FILE_EXT = /\.(js|ts|mjs|cjs)$/;

async function resolveEntryPath(
  rootDir: string,
  entryName: string,
  allowFlatFiles: boolean,
): Promise<{ fullPath: string; base: string } | null> {
  const fullEntry = join(rootDir, entryName);
  const entryStat = await stat(fullEntry).catch(() => null);
  if (!entryStat) return null;

  if (entryStat.isDirectory()) {
    for (const f of INDEX_FILES) {
      const s = await stat(join(fullEntry, f)).catch(() => null);
      if (s?.isFile()) return { fullPath: join(fullEntry, f), base: entryName };
    }
    return null;
  }

  if (allowFlatFiles && entryStat.isFile() && FLAT_FILE_EXT.test(entryName)) {
    return { fullPath: fullEntry, base: entryName.replace(FLAT_FILE_EXT, "") };
  }

  return null;
}

/**
 * Creates a typed extension registry backed by a shared file-discovery loop.
 *
 * Each call to `init()` scans the configured directories, imports every valid
 * extension module it finds, runs `match` on the exports, calls the optional
 * `onLoad` hook, then stores the result. `reload()` is an alias for `init()`.
 *
 * @template T The extension type this registry manages.
 *
 * @example
 * // Creating a new registry for a hypothetical "widget" extension type:
 *
 * interface Widget { id: string; render(): string; }
 *
 * function isWidget(val: unknown): val is Widget {
 *   return typeof val === "object" && val !== null
 *     && typeof (val as Widget).id === "string"
 *     && typeof (val as Widget).render === "function";
 * }
 *
 * const registry = createRegistry<Widget>({
 *   dirs: () => [{ dir: pluginsDir(), source: "plugin" }],
 *   match: (mod) => {
 *     const w = mod.widget ?? (mod.default as Record<string, unknown>)?.widget;
 *     return isWidget(w) ? w : null;
 *   },
 *   debugTag: "widgets",
 * });
 *
 * export const initWidgets = registry.init;
 * export const getWidgets = registry.items;
 */
export function createRegistry<T>(opts: RegistryOptions<T>): {
  items: () => T[];
  init: () => Promise<void>;
  reload: () => Promise<void>;
} {
  let _items: T[] = [];

  async function loadFromDir(registryDir: RegistryDir): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(registryDir.dir);
    } catch {
      return;
    }

    for (const entryName of entries) {
      const resolved = await resolveEntryPath(
        registryDir.dir,
        entryName,
        opts.allowFlatFiles ?? false,
      );
      if (!resolved) continue;

      try {
        const url = pathToFileURL(resolved.fullPath).href;
        const mod = (await import(url)) as Record<string, unknown>;
        const extracted = opts.match(mod);
        if (extracted == null) continue;
        if (opts.onLoad) {
          await opts.onLoad(extracted, {
            entryPath: join(registryDir.dir, resolved.base),
            folderName: resolved.base,
            source: registryDir.source,
          });
        }
        _items.push(extracted);
      } catch (err) {
        debug(opts.debugTag, `Failed to load: ${resolved.base}`, err);
      }
    }
  }

  async function init(): Promise<void> {
    _items = [];
    const dirs = typeof opts.dirs === "function" ? opts.dirs() : opts.dirs;
    for (const d of dirs) {
      await loadFromDir(d);
    }
  }

  return {
    items: () => [..._items],
    init,
    reload: init,
  };
}
