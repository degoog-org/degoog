import { readFile, stat } from "fs/promises";
import { dirname, join, resolve } from "path";
import { shortcutsDir } from "../../utils/paths";
import { makeExtID } from "../../utils/extension-support/extension-id";
import { asBoolean, getSettings } from "../../utils/settings/plugin-settings";
import { buildExtensionMeta } from "../extension-meta";
import { createRegistry } from "../registry-factory";
import { type ExtensionMeta, ExtensionStoreType } from "../../types/extension";
import type {
  ClientShortcut,
  ShortcutActionMeta,
  ShortcutBinding,
  ShortcutKind,
} from "../../../shared/shortcuts";

export interface ShortcutExtension {
  id?: string;
  name: string;
  description?: string;
  kind?: ShortcutKind;
  defaultBinding: ShortcutBinding;
  run: () => void;
  source?: "builtin" | "plugin";
  entryFile?: string;
  editable?: boolean;
}

const isBinding = (value: unknown): value is ShortcutBinding => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if ("key" in record && typeof record.key !== "string") return false;
  for (const mod of ["ctrl", "meta", "alt", "shift"] as const) {
    if (mod in record && typeof record[mod] !== "boolean") return false;
  }
  return typeof record.key === "string" && record.key.trim().length > 0;
};

const isShortcutExtension = (value: unknown): value is ShortcutExtension => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<ShortcutExtension>;
  return (
    typeof record.name === "string" &&
    record.name.trim().length > 0 &&
    isBinding(record.defaultBinding) &&
    typeof record.run === "function"
  );
};

const registry = createRegistry<ShortcutExtension>({
  dirs: () => [{ dir: shortcutsDir() }],
  allowFlatFiles: true,
  canonicalIdKind: "shortcut",
  match: (mod) => {
    const candidate =
      mod.shortcut ?? (mod.default as Record<string, unknown> | undefined);
    return isShortcutExtension(candidate) ? candidate : null;
  },
  onLoad: async (shortcut, meta) => {
    shortcut.id = meta.canonicalId ?? makeExtID(meta.folderName, "shortcut");
    shortcut.source = meta.source;
    const flatCandidates = [".js", ".ts", ".mjs", ".cjs"].map(
      (ext) => `${meta.entryPath}${ext}`,
    );
    const folderCandidates = ["index.js", "index.ts", "index.mjs", "index.cjs"].map(
      (file) => join(meta.entryPath, file),
    );
    for (const candidate of [...flatCandidates, ...folderCandidates]) {
      const s = await stat(candidate).catch(() => null);
      if (s?.isFile()) {
        shortcut.entryFile = candidate;
        shortcut.editable = dirname(resolve(candidate)) === resolve(shortcutsDir());
        break;
      }
    }
  },
  debugTag: "shortcuts",
});

export const initShortcutsRegistry = registry.init;
export const reloadShortcutsRegistry = (bust = false): Promise<void> =>
  bust ? registry.reload() : registry.refresh();
export const getShortcutExtensions = (): ShortcutExtension[] => registry.items();

const _actionMeta = (shortcut: ShortcutExtension): ShortcutActionMeta => ({
  id: shortcut.id ?? "",
  kind: shortcut.kind ?? "single",
  defaultBinding: shortcut.defaultBinding,
  displayName: shortcut.name,
  description: shortcut.description ?? "",
  source: shortcut.source,
  editable: shortcut.editable === true,
});

export const getShortcutActions = (): ShortcutActionMeta[] =>
  getShortcutExtensions().map(_actionMeta);

export const getShortcutDisabledStates = async (): Promise<
  Record<string, boolean>
> => {
  const states: Record<string, boolean> = {};
  for (const shortcut of getShortcutExtensions()) {
    if (!shortcut.id) continue;
    const settings = await getSettings(shortcut.id);
    states[shortcut.id] = asBoolean(settings.disabled);
  }
  return states;
};

export const getClientShortcuts = async (): Promise<ClientShortcut[]> => {
  const result: ClientShortcut[] = [];
  for (const shortcut of getShortcutExtensions()) {
    if (!shortcut.id) continue;
    const settings = await getSettings(shortcut.id);
    if (asBoolean(settings.disabled)) continue;
    result.push({
      ..._actionMeta(shortcut),
      moduleUrl: `/api/shortcuts/modules/${encodeURIComponent(shortcut.id)}.js`,
    });
  }
  return result;
};

export const getShortcutExtensionMeta = async (): Promise<ExtensionMeta[]> =>
  Promise.all(
    getShortcutExtensions().map(async (shortcut) =>
      buildExtensionMeta({
        id: shortcut.id ?? "",
        displayName: shortcut.name,
        description: shortcut.description ?? "",
        type: ExtensionStoreType.Shortcut,
        schema: [
          {
            key: "disabled",
            label: "Disable shortcut",
            type: "toggle",
            default: "false",
          },
        ],
        rawSettings: await getSettings(shortcut.id ?? ""),
      }),
    ),
  );

export const getShortcutModuleSource = async (
  id: string,
): Promise<string | null> => {
  const shortcut = getShortcutExtensions().find((item) => item.id === id);
  if (!shortcut?.entryFile) return null;
  try {
    return await readFile(shortcut.entryFile, "utf-8");
  } catch {
    return null;
  }
};

export const getEditableShortcutFile = (id: string): string | null => {
  const shortcut = getShortcutExtensions().find((item) => item.id === id);
  return shortcut?.editable && shortcut.entryFile ? shortcut.entryFile : null;
};
