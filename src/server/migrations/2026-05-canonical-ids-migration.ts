import { readFile, writeFile, mkdir, rename, readdir, stat } from "fs/promises";
import { dirname, join } from "path";
import { logger } from "../utils/logger";
import {
  autocompleteDir,
  enginesDir,
  pluginsDir,
  pluginSettingsFile,
  themesDir,
  transportsDir,
} from "../utils/paths";
import { folderNameForItem } from "../utils/extension-id";
import { makeExtID, type ExtensionKind } from "../extensions/extension-id";
import {
  getReposPath,
  getStoreDir,
  readReposData,
  writeReposData,
} from "../extensions/store/persistence";
import { slugFromUrl } from "../extensions/store/repo-ops";
import {
  readServerSettings,
  writeServerSettings,
  type ServerSettingValue,
} from "../utils/server-settings";
import {
  ExtensionStoreType,
  type RepoPackageJson,
  type ReposData,
} from "../types";

export const MIGRATION_VERSION = 52028 as const;
const SCHEMA_KEY = "__schemaVersion";

const TAG = "migration";
const LEGACY_PLUGIN_PREFIX = "plugin-";
const LEGACY_HASH_DIR = /^[0-9a-f]{8}-/;

const DEGOOG_INSTANCE_SETTINGS_ID = "degoog-settings";
const DEGOOG_API_SECRET_ID = "degoog-api-secret";
const API_SECRET_LEGACY_FIELD = "key";
const API_SECRET_TARGET_FIELD = "apiSecretKey";

const SRC_EXTENSIONS = join(process.cwd(), "src", "server", "extensions");
const COMMANDS_BUILTINS_DIR = join(SRC_EXTENSIONS, "commands", "builtins");
const UOVADIPASQUA_BUILTINS_DIR = join(SRC_EXTENSIONS, "uovadipasqua", "builtins");

const RESERVED_KEYS = new Set<string>(["theme", "degoog-api-secret", "middleware"]);
const AMBIGUOUS_BARE_KEYS = new Set<string>(["wikipedia"]);

const BUILTIN_MOVES: Array<{ from: string; to: string }> = [
  { from: "ai-summary-slot", to: "degoog-org-official-extensions-ai-summary-slot" },
];

const OFFICIAL_THEME_OVERRIDES: Record<string, string> = {
  catpuccin: "degoog-org-official-extensions-catpuccin-theme",
  "degoog-docs": "degoog-org-official-extensions-degoog-docs-theme",
  pokemon: "degoog-org-official-extensions-pokemon-theme",
  zen: "degoog-org-official-extensions-zen-theme",
};

/**
 * Last-resort fallback for official-store legacy keys, applied only after
 * manifest-based resolution finds nothing. Manifest legacyIds win for users
 * who still have the official repo cloned under data/store; this table covers
 * users who are missing that repo or whose clone predates the legacyIds, plus
 * cross-kind renames that no manifest entry can express. The official IDs are
 * frozen before go-live, so these mappings stay valid.
 */
const OFFICIAL_STORE_OVERRIDES: Record<string, string> = {
  "ai-summary": "degoog-org-official-extensions-ai-summary-slot",
  "ai-summary-slot": "degoog-org-official-extensions-ai-summary-slot",
  "apps-pocket": "degoog-org-official-extensions-apps-pocket-command",
  "autocomplete-builtin-duckduckgo": "degoog-org-official-extensions-duckduckgo-autocomplete",
  "autocomplete-builtin-google": "degoog-org-official-extensions-google-autocomplete",
  bing: "degoog-org-official-extensions-bing-engine",
  "bing-engine": "degoog-org-official-extensions-bing-engine",
  "bing-images": "degoog-org-official-extensions-bing-images-engine",
  "bing-images-engine": "degoog-org-official-extensions-bing-images-engine",
  "bing-news": "degoog-org-official-extensions-bing-news-engine",
  "bing-news-engine": "degoog-org-official-extensions-bing-news-engine",
  "bing-videos": "degoog-org-official-extensions-bing-videos-engine",
  "bing-videos-engine": "degoog-org-official-extensions-bing-videos-engine",
  brave: "degoog-org-official-extensions-brave-engine",
  "brave-api-search": "degoog-org-official-extensions-brave-api-search-engine",
  "brave-engine": "degoog-org-official-extensions-brave-engine",
  "brave-news": "degoog-org-official-extensions-brave-news-engine",
  "brave-news-engine": "degoog-org-official-extensions-brave-news-engine",
  browserless: "degoog-org-official-extensions-browserless-transport",
  camoufox: "degoog-org-official-extensions-camoufox-transport",
  catpuccin: "degoog-org-official-extensions-catpuccin-theme",
  cloakbrowser: "degoog-org-official-extensions-cloakbrowser-transport",
  colors: "degoog-org-official-extensions-colors-command",
  "ddg-bang": "degoog-org-official-extensions-ddg-bang-command",
  define: "degoog-org-official-extensions-define-command",
  "degoog-docs": "degoog-org-official-extensions-degoog-docs-theme",
  "degoog-fplay": "degoog-org-official-extensions-degoog-fplay-transport",
  duckduckgo: "degoog-org-official-extensions-duckduckgo-engine",
  "duckduckgo-engine": "degoog-org-official-extensions-duckduckgo-engine",
  "duckduckgo-images": "degoog-org-official-extensions-duckduckgo-images-engine",
  "duckduckgo-news": "degoog-org-official-extensions-duckduckgo-news-engine",
  ecosia: "degoog-org-official-extensions-ecosia-engine",
  flaresolverr: "degoog-org-official-extensions-flaresolverr-transport",
  freshrss: "degoog-org-official-extensions-freshrss-slot",
  "github-slot": "degoog-org-official-extensions-github-slot",
  google: "degoog-org-official-extensions-google-engine",
  "google-engine": "degoog-org-official-extensions-google-engine",
  "google-images": "degoog-org-official-extensions-google-images-engine",
  "google-images-engine": "degoog-org-official-extensions-google-images-engine",
  "google-videos": "degoog-org-official-extensions-google-videos-engine",
  "google-videos-engine": "degoog-org-official-extensions-google-videos-engine",
  "hacker-news": "degoog-org-official-extensions-hacker-news-engine",
  "highlight-terms": "degoog-org-official-extensions-highlight-terms-command",
  "internet-archive": "degoog-org-official-extensions-internet-archive-engine",
  jellyfin: "degoog-org-official-extensions-jellyfin-command",
  lemmy: "degoog-org-official-extensions-lemmy-engine",
  "math-slot": "degoog-org-official-extensions-math-slot",
  meilisearch: "degoog-org-official-extensions-meilisearch-command",
  "nasa-images": "degoog-org-official-extensions-nasa-images-engine",
  openverse: "degoog-org-official-extensions-openverse-engine",
  password: "degoog-org-official-extensions-password-command",
  "plugin-rss": "degoog-org-official-extensions-rss-slot",
  pokemon: "degoog-org-official-extensions-pokemon-theme",
  qr: "degoog-org-official-extensions-qr-command",
  reddit: "degoog-org-official-extensions-reddit-engine",
  "reddit-engine": "degoog-org-official-extensions-reddit-engine",
  romm: "degoog-org-official-extensions-romm-command",
  rss: "degoog-org-official-extensions-rss-slot",
  "search-history": "degoog-org-official-extensions-search-history-command",
  "spell-check": "degoog-org-official-extensions-spell-check-middleware",
  startpage: "degoog-org-official-extensions-startpage-engine",
  "the-guardian": "degoog-org-official-extensions-the-guardian-engine",
  time: "degoog-org-official-extensions-time-command",
  "tmdb-slot": "degoog-org-official-extensions-tmdb-slot",
  "transport-degoog-4play": "degoog-org-official-extensions-degoog-fplay-transport",
  weather: "degoog-org-official-extensions-weather-command",
  "wikimedia-commons": "degoog-org-official-extensions-wikimedia-commons-engine",
  wikipedia: "degoog-org-official-extensions-wikipedia-engine",
  "wikipedia-engine": "degoog-org-official-extensions-wikipedia-engine",
  yahoo: "degoog-org-official-extensions-yahoo-autocomplete",
  zen: "degoog-org-official-extensions-zen-theme",
};

type SettingsValue = string | string[] | boolean;
type SettingsRecord = Record<string, SettingsValue>;
type SettingsStore = Record<string, SettingsRecord | number | undefined> & {
  [SCHEMA_KEY]?: number;
};

interface ManifestEntry {
  path?: string;
  name?: string;
  type?: string;
  legacyIds?: string[];
}

interface RepoPkg {
  url: string;
  local: string;
  pkg: RepoPackageJson;
}

interface MappingData {
  aliases: Map<string, string>;
  themeAliases: Map<string, string>;
  autocompleteAliases: Map<string, string>;
}

interface Mappings {
  canonicals: Set<string>;
  map: Map<string, string[]>;
  add: (legacy: string, canonical: string) => void;
}

interface CanonicalCtx {
  canonicals: Set<string>;
  resolve: (legacy: string) => string[];
}

const KIND_BY_GROUP: Record<string, ExtensionKind> = {
  engines: "engine",
  themes: "theme",
  plugins: "command",
  transports: "transport",
};

const REPO_GROUPS = ["engines", "themes", "plugins", "transports"] as const;

const REPO_GROUP_DIRS: { group: string; dir: () => string }[] = [
  { group: "engines", dir: enginesDir },
  { group: "autocomplete", dir: autocompleteDir },
  { group: "plugins", dir: pluginsDir },
  { group: "transports", dir: transportsDir },
];

const readJson = async <T,>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") logger.warn(TAG, `failed to read ${path}`, err);
    return null;
  }
};

const writeAtomic = async (path: string, contents: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmp, contents, "utf-8");
  await rename(tmp, path);
};

const backupPath = (path: string): string =>
  `${path}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;

const writeBackup = async (path: string): Promise<boolean> => {
  try {
    const raw = await readFile(path, "utf-8");
    const dest = backupPath(path);
    await writeFile(dest, raw, "utf-8");
    logger.info(TAG, `wrote backup ${dest}`);
    return true;
  } catch (err) {
    logger.error(TAG, `failed to write backup for ${path}`, err);
    return false;
  }
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const listDirs = async (path: string): Promise<string[]> => {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};

const isRecord = (value: SettingsStore[string]): value is SettingsRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const lastSegment = (path: string): string =>
  path.replace(/\/$/, "").split("/").filter(Boolean).pop() ?? path;

const entriesOf = (pkg: RepoPackageJson, group: string): ManifestEntry[] => {
  const value = (pkg as unknown as Record<string, unknown>)[group];
  return Array.isArray(value) ? (value as ManifestEntry[]) : [];
};

const newMappings = (): Mappings => {
  const canonicals = new Set<string>();
  const map = new Map<string, string[]>();
  const add = (legacy: string, canonical: string): void => {
    if (!legacy || legacy === canonical) return;
    const existing = map.get(legacy) ?? [];
    if (!existing.includes(canonical)) existing.push(canonical);
    map.set(legacy, existing);
  };
  return { canonicals, map, add };
};

const mergeKey = (
  store: SettingsStore,
  legacyKey: string,
  canonicalId: string,
): boolean => {
  if (legacyKey === canonicalId) return false;
  const legacyVal = store[legacyKey];
  if (!isRecord(legacyVal)) return false;
  const current = store[canonicalId];
  const canonicalVal = isRecord(current) ? current : {};
  store[canonicalId] = { ...legacyVal, ...canonicalVal };
  delete store[legacyKey];
  logger.info(TAG, `rewrote "${legacyKey}" -> "${canonicalId}"`);
  return true;
};

const loadRepoPkgs = async (
  storeDir: string,
  repos: { url: string; localPath?: string }[],
): Promise<RepoPkg[]> => {
  const out: RepoPkg[] = [];
  for (const repo of repos) {
    const local = repo.localPath ?? slugFromUrl(repo.url);
    const pkg = await readJson<RepoPackageJson>(join(storeDir, local, "package.json"));
    if (pkg) out.push({ url: repo.url, local, pkg });
  }
  return out;
};

const renameStoreDirs = async (
  storeDir: string,
  data: ReposData,
): Promise<boolean> => {
  const existing = await readdir(storeDir).catch(() => null);
  if (!existing) return false;

  let changed = false;
  for (const repo of data.repos) {
    const desired = slugFromUrl(repo.url);
    const currentLocal = repo.localPath ?? desired;
    if (currentLocal === desired) continue;

    if (!existing.includes(currentLocal)) {
      repo.localPath = desired;
      changed = true;
      continue;
    }
    if (await exists(join(storeDir, desired))) {
      logger.warn(TAG, `target already exists, skipping rename: ${desired}`);
      continue;
    }
    await rename(join(storeDir, currentLocal), join(storeDir, desired));
    logger.info(TAG, `renamed store dir ${currentLocal} -> ${desired}`);
    repo.localPath = desired;
    changed = true;
  }

  for (const dir of existing) {
    if (!LEGACY_HASH_DIR.test(dir)) continue;
    if (data.repos.find((r) => r.localPath === dir)) continue;
    logger.warn(TAG, `legacy dir ${dir} has no matching repos.json entry, leaving in place`);
  }

  return changed;
};

const renameItemDirs = async (repoPkgs: RepoPkg[]): Promise<void> => {
  const ownership = new Map<string, { repoSlug: string }[]>();
  for (const { local, pkg } of repoPkgs) {
    for (const { group } of REPO_GROUP_DIRS) {
      for (const ent of entriesOf(pkg, group)) {
        if (typeof ent.path !== "string") continue;
        const folder = lastSegment(ent.path);
        if (!folder) continue;
        const key = `${group}:${folder}`;
        ownership.set(key, [...(ownership.get(key) ?? []), { repoSlug: local }]);
      }
    }
  }

  for (const { group, dir } of REPO_GROUP_DIRS) {
    const targetDir = dir();
    let folders: string[];
    try {
      folders = await readdir(targetDir);
    } catch {
      continue;
    }
    for (const folder of folders) {
      const owners = ownership.get(`${group}:${folder}`);
      if (!owners || owners.length === 0) continue;
      if (owners.length > 1) {
        logger.warn(
          TAG,
          `legacy ${group} folder "${folder}" appears in multiple repos (${owners
            .map((o) => o.repoSlug)
            .join(", ")}); leaving in place`,
        );
        continue;
      }
      const newName = `${owners[0].repoSlug}-${folder}`;
      if (newName === folder) continue;
      const dst = join(targetDir, newName);
      if (await exists(dst)) {
        logger.warn(TAG, `target ${dst} already exists; leaving "${folder}" in place`);
        continue;
      }
      try {
        await rename(join(targetDir, folder), dst);
        logger.info(TAG, `renamed ${group}/${folder} -> ${group}/${newName}`);
      } catch (err) {
        logger.error(TAG, `failed to rename ${group}/${folder}`, err);
      }
    }
  }
};

const expectedInstalledAs = (item: ReposData["installed"][number]): string => {
  if (item.type === ExtensionStoreType.Theme) {
    return makeExtID(folderNameForItem(item.repoUrl, item.itemPath), "theme");
  }
  if (item.type === ExtensionStoreType.Autocomplete) {
    return makeExtID(folderNameForItem(item.repoUrl, item.itemPath), "autocomplete");
  }
  return folderNameForItem(item.repoUrl, item.itemPath.replace(/\/$/, ""));
};

const syncInstalledAs = (data: ReposData): boolean => {
  let changed = false;
  for (const item of data.installed) {
    const expected = expectedInstalledAs(item);
    if (item.installedAs === expected) continue;
    logger.info(TAG, `installedAs "${item.installedAs}" -> "${expected}" (${item.itemPath})`);
    item.installedAs = expected;
    changed = true;
  }
  return changed;
};

const renameFolders = async (
  dir: string,
  aliases: Map<string, string>,
  kind: "theme" | "autocomplete",
): Promise<void> => {
  await mkdir(dir, { recursive: true });
  for (const folder of await listDirs(dir)) {
    const canonical = aliases.get(folder) ?? makeExtID(folder, kind);
    if (folder === canonical) continue;
    const dst = join(dir, canonical);
    if (await exists(dst)) {
      logger.warn(TAG, `target ${dst} already exists; leaving "${folder}" in place`);
      continue;
    }
    try {
      await rename(join(dir, folder), dst);
      logger.info(TAG, `renamed ${kind}/${folder} -> ${kind}/${canonical}`);
    } catch (err) {
      logger.error(TAG, `failed to rename ${kind}/${folder}`, err);
    }
  }
};

const detectBuiltinKinds = async (
  indexPath: string,
): Promise<{ command: boolean; slot: boolean }> => {
  let src = "";
  try {
    src = await readFile(indexPath, "utf-8");
  } catch {
    return { command: false, slot: false };
  }
  const slot = /export\s+const\s+slot\s*=|export\s+const\s+slotPlugin\s*=/.test(src);
  const command =
    /export\s+default\s+\w*[Cc]ommand|export\s+const\s+\w*[Cc]ommand\s*:\s*BangCommand/.test(src) ||
    /export\s+default\s+\{[\s\S]*trigger\s*:/.test(src);
  return { command, slot };
};

const collectBuiltinMappings = async (): Promise<Mappings> => {
  const m = newMappings();
  for (const folder of await listDirs(COMMANDS_BUILTINS_DIR)) {
    let detected = { command: false, slot: false };
    for (const f of ["index.ts", "index.js", "index.mjs", "index.cjs"]) {
      const probe = await detectBuiltinKinds(join(COMMANDS_BUILTINS_DIR, folder, f));
      if (probe.command || probe.slot) {
        detected = probe;
        break;
      }
    }
    if (detected.command) {
      const id = makeExtID(folder, "command");
      m.canonicals.add(id);
      m.add(folder, id);
    }
    if (detected.slot) {
      const id = makeExtID(folder, "slot");
      m.canonicals.add(id);
      m.add(folder, id);
      m.add(`slot-${folder}`, id);
      m.add(`slot-builtin-${folder}`, id);
      m.add(`slot-builtin-${folder}-slot`, id);
    }
  }
  for (const folder of await listDirs(UOVADIPASQUA_BUILTINS_DIR)) {
    const id = makeExtID(folder, "uovadipasqua");
    m.canonicals.add(id);
    m.add(folder, id);
    m.add(`uovadipasqua-${folder}`, id);
  }
  return m;
};

const collectInstalledMappings = async (): Promise<Mappings> => {
  const m = newMappings();
  for (const folder of await listDirs(enginesDir())) {
    const id = makeExtID(folder, "engine");
    m.canonicals.add(id);
    m.add(folder, id);
    m.add(`engine-${folder}`, id);
  }
  for (const folder of await listDirs(autocompleteDir())) {
    const id = makeExtID(folder, "autocomplete");
    m.canonicals.add(id);
    m.add(folder, id);
    m.add(`autocomplete-${folder}`, id);
  }
  for (const folder of await listDirs(transportsDir())) {
    const id = makeExtID(folder, "transport");
    m.canonicals.add(id);
    m.add(`transport-${folder}`, id);
    m.add(`transport-${id}`, id);
    m.add(folder, id);
  }
  for (const folder of await listDirs(pluginsDir())) {
    const cmdId = makeExtID(folder, "command");
    const slotId = makeExtID(folder, "slot");
    const middlewareId = makeExtID(folder, "middleware");
    const tabId = makeExtID(folder, "tab");
    m.canonicals.add(cmdId);
    m.canonicals.add(slotId);
    m.canonicals.add(middlewareId);
    m.canonicals.add(tabId);
    m.add(`command-${folder}`, cmdId);
    m.add(`plugin-${folder}`, cmdId);
    m.add(`slot-${folder}`, slotId);
    m.add(`middleware-${folder}`, middlewareId);
    m.add(`interceptor-${folder}`, middlewareId);
    m.add(`tab-${folder}`, tabId);
    m.add(`search-result-tab-${folder}`, tabId);
    m.add(folder, cmdId);
    m.add(folder, slotId);
  }
  return m;
};

const kindFromManifest = (group: string, entry: ManifestEntry): ExtensionKind => {
  if (group === "plugins" && entry.type) {
    const t = entry.type.toLowerCase();
    if (t === "slot") return "slot";
    if (t === "interceptor") return "middleware";
    if (t === "search-result-tab") return "tab";
  }
  return KIND_BY_GROUP[group] ?? "command";
};

const collectRepoMappings = (repoPkgs: RepoPkg[]): Mappings => {
  const m = newMappings();
  for (const { local, pkg } of repoPkgs) {
    for (const group of REPO_GROUPS) {
      for (const ent of entriesOf(pkg, group)) {
        if (typeof ent.path !== "string") continue;
        const itemFolder = lastSegment(ent.path);
        if (!itemFolder) continue;
        const kind = kindFromManifest(group, ent);
        const folder = `${local}-${itemFolder}`;
        const canonicalId = makeExtID(folder, kind);
        m.canonicals.add(canonicalId);

        const candidates = new Set<string>([
          itemFolder,
          `${itemFolder}-${kind}`,
          `${kind}-${itemFolder}`,
          folder,
        ]);
        if (kind === "command") {
          candidates.add(`plugin-${itemFolder}`);
          candidates.add(`plugin-${folder}`);
          candidates.add(`command-${itemFolder}`);
        }
        for (const l of ent.legacyIds ?? []) {
          if (typeof l === "string" && l.trim()) candidates.add(l.trim());
        }
        for (const c of candidates) m.add(c, canonicalId);
      }
    }

    for (const ent of entriesOf(pkg, "autocomplete")) {
      if (typeof ent.path !== "string") continue;
      const itemFolder = lastSegment(ent.path);
      if (!itemFolder) continue;
      const folder = `${local}-${itemFolder}`;
      const canonicalId = makeExtID(folder, "autocomplete");
      m.canonicals.add(canonicalId);

      const candidates = new Set<string>([
        `autocomplete-${itemFolder}`,
        `autocomplete-builtin-${itemFolder}`,
        `autocomplete-${folder}`,
        itemFolder,
        makeExtID(itemFolder, "autocomplete"),
        folder,
      ]);
      for (const l of ent.legacyIds ?? []) {
        if (typeof l === "string" && l.trim()) candidates.add(l.trim());
      }
      for (const c of candidates) m.add(c, canonicalId);
    }
  }
  return m;
};

const collectManifestAliases = (
  repoPkgs: RepoPkg[],
  installed: ReposData["installed"],
): MappingData => {
  const aliases = new Map<string, string>();
  const themeAliases = new Map<string, string>();
  const autocompleteAliases = new Map<string, string>();

  const set = (map: Map<string, string>, legacy: string, canonical: string): void => {
    if (!legacy || legacy === canonical) return;
    if (!map.has(legacy)) map.set(legacy, canonical);
  };
  const addTheme = (legacy: string, canonical: string): void => {
    set(aliases, legacy, canonical);
    set(themeAliases, legacy, canonical);
  };
  const addAutocomplete = (legacy: string, canonical: string): void => {
    set(aliases, legacy, canonical);
    set(autocompleteAliases, legacy, canonical);
  };

  for (const [legacy, canonical] of Object.entries(OFFICIAL_THEME_OVERRIDES)) {
    addTheme(legacy, canonical);
    addTheme(makeExtID(legacy, "theme"), canonical);
  }

  for (const { url, local, pkg } of repoPkgs) {
    for (const ent of pkg.themes ?? []) {
      if (!ent?.path) continue;
      const folder = lastSegment(ent.path);
      const base = folderNameForItem(url, ent.path);
      const canonical = makeExtID(base, "theme");
      addTheme(folder, canonical);
      addTheme(base, canonical);
      addTheme(makeExtID(folder, "theme"), canonical);
      addTheme(makeExtID(base, "theme"), canonical);
      addTheme(`${local}-${folder}`, canonical);
      addTheme(makeExtID(`${local}-${folder}`, "theme"), canonical);
      if (ent.name) addTheme(ent.name, canonical);
    }
    for (const ent of pkg.autocomplete ?? []) {
      if (!ent?.path) continue;
      const folder = lastSegment(ent.path);
      const base = folderNameForItem(url, ent.path);
      const canonical = makeExtID(base, "autocomplete");
      addAutocomplete(folder, canonical);
      addAutocomplete(base, canonical);
      addAutocomplete(`autocomplete-${folder}`, canonical);
      addAutocomplete(`autocomplete-${base}`, canonical);
      addAutocomplete(makeExtID(folder, "autocomplete"), canonical);
      addAutocomplete(makeExtID(base, "autocomplete"), canonical);
      for (const l of (ent as ManifestEntry).legacyIds ?? []) {
        if (l.trim()) addAutocomplete(l.trim(), canonical);
      }
    }
  }

  for (const item of installed) {
    const base = folderNameForItem(item.repoUrl, item.itemPath);
    if (item.type === ExtensionStoreType.Theme) {
      const canonical = makeExtID(base, "theme");
      addTheme(item.installedAs, canonical);
      addTheme(base, canonical);
      addTheme(lastSegment(item.itemPath), canonical);
      addTheme(makeExtID(item.installedAs, "theme"), canonical);
    } else if (item.type === ExtensionStoreType.Autocomplete) {
      const canonical = makeExtID(base, "autocomplete");
      addAutocomplete(item.installedAs, canonical);
      addAutocomplete(base, canonical);
      addAutocomplete(lastSegment(item.itemPath), canonical);
      addAutocomplete(`autocomplete-${item.installedAs}`, canonical);
      addAutocomplete(`autocomplete-${base}`, canonical);
    }
  }

  return { aliases, themeAliases, autocompleteAliases };
};

const applyServerExtract = async (store: SettingsStore): Promise<boolean> => {
  const instanceBlob = store[DEGOOG_INSTANCE_SETTINGS_ID];
  const apiSecretBlob = store[DEGOOG_API_SECRET_ID];
  const apiSecretKey = isRecord(apiSecretBlob)
    ? (apiSecretBlob as Record<string, unknown>)[API_SECRET_LEGACY_FIELD]
    : undefined;

  const hasInstanceBlob = isRecord(instanceBlob);
  const hasApiSecret = typeof apiSecretKey === "string" && apiSecretKey.length > 0;
  if (!hasInstanceBlob && !hasApiSecret) return false;

  const existing = await readServerSettings();
  const incoming: Record<string, ServerSettingValue> = hasInstanceBlob
    ? { ...(instanceBlob as Record<string, ServerSettingValue>) }
    : {};
  if (hasApiSecret) incoming[API_SECRET_TARGET_FIELD] = apiSecretKey as string;

  await writeServerSettings({ settings: { ...incoming, ...existing.settings } });
  logger.info(
    TAG,
    `moved ${Object.keys(incoming).length} key(s) to server-settings.json` +
    `${hasInstanceBlob ? ` (incl. ${DEGOOG_INSTANCE_SETTINGS_ID})` : ""}` +
    `${hasApiSecret ? ` (incl. ${DEGOOG_API_SECRET_ID})` : ""}`,
  );

  if (hasInstanceBlob) delete store[DEGOOG_INSTANCE_SETTINGS_ID];
  if (hasApiSecret) delete store[DEGOOG_API_SECRET_ID];
  return true;
};

const applyCanonical = (store: SettingsStore, ctx: CanonicalCtx): boolean => {
  const rewrites: Array<{ legacyKey: string; canonicalId: string }> = [];
  const unresolved: string[] = [];

  for (const key of Object.keys(store).filter((k) => !k.startsWith("__"))) {
    if (RESERVED_KEYS.has(key)) continue;
    if (ctx.canonicals.has(key)) continue;
    const candidates = ctx.resolve(key);
    if (candidates.length > 1) {
      logger.warn(
        TAG,
        `legacy key "${key}" maps to multiple canonical IDs (${candidates.join(", ")}); leaving verbatim`,
      );
      continue;
    }
    if (candidates.length === 1) {
      rewrites.push({ legacyKey: key, canonicalId: candidates[0] });
      continue;
    }
    const fallback = OFFICIAL_STORE_OVERRIDES[key];
    if (fallback) {
      rewrites.push({ legacyKey: key, canonicalId: fallback });
      logger.info(TAG, `orphan "${key}" resolved via official-store fallback -> "${fallback}"`);
      continue;
    }
    unresolved.push(key);
  }

  if (unresolved.length > 0) {
    logger.info(TAG, `left ${unresolved.length} orphan key(s) verbatim: ${unresolved.join(", ")}`);
  }

  let changed = false;
  for (const { legacyKey, canonicalId } of rewrites) {
    if (mergeKey(store, legacyKey, canonicalId)) changed = true;
  }
  return changed;
};

const applyCommands = (store: SettingsStore, builtinCommands: Set<string>): boolean => {
  let changed = false;
  for (const key of Object.keys(store).filter((k) => !k.startsWith("__"))) {
    if (key.startsWith(LEGACY_PLUGIN_PREFIX)) {
      const folder = key.slice(LEGACY_PLUGIN_PREFIX.length);
      if (folder && mergeKey(store, key, makeExtID(folder, "command"))) changed = true;
      continue;
    }
    if (builtinCommands.has(key) && !AMBIGUOUS_BARE_KEYS.has(key)) {
      if (mergeKey(store, key, makeExtID(key, "command"))) changed = true;
    }
  }
  return changed;
};

const canonicalSettingId = (key: string, mappings: MappingData): string | null => {
  if (RESERVED_KEYS.has(key)) return null;
  if (key.startsWith("transport-")) {
    const rest = key.slice("transport-".length);
    return rest.endsWith("-transport") ? rest : makeExtID(rest, "transport");
  }
  if (key.startsWith("theme-")) {
    const rest = key.slice("theme-".length);
    return mappings.themeAliases.get(rest) ?? makeExtID(rest, "theme");
  }
  if (key.startsWith("autocomplete-")) {
    const rest = key.slice("autocomplete-".length);
    return mappings.autocompleteAliases.get(rest) ?? makeExtID(rest, "autocomplete");
  }
  return mappings.aliases.get(key) ?? null;
};

const applyThemeTransport = (store: SettingsStore, mappings: MappingData): boolean => {
  let changed = false;

  const themeSettings = store.theme;
  if (isRecord(themeSettings)) {
    const active = typeof themeSettings.active === "string" ? themeSettings.active : "";
    const canonicalActive =
      mappings.themeAliases.get(active) ?? (active ? makeExtID(active, "theme") : "");
    if (active && canonicalActive !== active) {
      store.theme = { ...themeSettings, active: canonicalActive };
      changed = true;
    }
  }

  for (const key of Object.keys(store).filter((k) => !k.startsWith("__"))) {
    const canonicalId = canonicalSettingId(key, mappings);
    if (canonicalId && mergeKey(store, key, canonicalId)) changed = true;
  }
  return changed;
};

const applyBuiltinMoves = (store: SettingsStore): boolean => {
  let changed = false;
  for (const { from, to } of BUILTIN_MOVES) {
    if (from in store && !(to in store)) {
      store[to] = store[from];
      delete store[from];
      changed = true;
      logger.info(TAG, `moved settings key ${from} -> ${to}`);
    }
  }
  return changed;
};

/**
 * Sorts out all legacy IDs locking them order behind one `__schemaVersion` gate.
 *   1. store clone dirs -> deterministic {author}-{repo} slugs
 *   2. legacy item dirs -> {repoSlug}-{itemFolder}
 *   3. repos.json installedAs -> canonical folder names (all item kinds)
 *   4. theme/autocomplete folders -> canonical ids
 *   5. plugin-settings keys, read once and rewritten in memory:
 *        server-settings extraction, canonical ids, command ids,
 *        theme/transport/autocomplete ids, built-in key moves
 *
 * The key-rewrite order is load-bearing:
 * command and theme/transport namespaces touch overlapping namespaces and only
 * converge when run once in this order.
 */
export const runCanonicalIdsMigration052028 = async (): Promise<void> => {
  const settingsPath = pluginSettingsFile();
  const store = await readJson<SettingsStore>(settingsPath);
  const version = store && typeof store[SCHEMA_KEY] === "number" ? store[SCHEMA_KEY] : 0;
  if (version >= MIGRATION_VERSION) return;

  const storeDir = getStoreDir();
  const reposData = await readReposData();

  let reposChanged = await renameStoreDirs(storeDir, reposData);
  const repoPkgs = await loadRepoPkgs(storeDir, reposData.repos);
  await renameItemDirs(repoPkgs);

  const mappings = collectManifestAliases(repoPkgs, reposData.installed);

  if (store) {
    const builtin = await collectBuiltinMappings();
    const installed = await collectInstalledMappings();
    const repoMap = collectRepoMappings(repoPkgs);
    const resolve = (legacy: string): string[] => {
      const fromRepo = repoMap.map.get(legacy);
      if (fromRepo && fromRepo.length > 0) return fromRepo;
      const fromBuiltin = builtin.map.get(legacy);
      if (fromBuiltin && fromBuiltin.length > 0) return fromBuiltin;
      return installed.map.get(legacy) ?? [];
    };
    const ctx: CanonicalCtx = {
      canonicals: new Set([
        ...builtin.canonicals,
        ...installed.canonicals,
        ...repoMap.canonicals,
      ]),
      resolve,
    };
    const builtinCommands = new Set(await listDirs(COMMANDS_BUILTINS_DIR));

    let changed = await applyServerExtract(store);
    if (applyCanonical(store, ctx)) changed = true;
    if (applyCommands(store, builtinCommands)) changed = true;
    if (applyThemeTransport(store, mappings)) changed = true;
    if (applyBuiltinMoves(store)) changed = true;

    if (changed) await writeBackup(settingsPath);
    store[SCHEMA_KEY] = MIGRATION_VERSION;
    await writeAtomic(settingsPath, JSON.stringify(store, null, 2));
  }

  await renameFolders(themesDir(), mappings.themeAliases, "theme");
  await renameFolders(autocompleteDir(), mappings.autocompleteAliases, "autocomplete");

  if (syncInstalledAs(reposData)) reposChanged = true;
  if (reposChanged) {
    await writeBackup(getReposPath());
    await writeReposData(reposData);
  }
};
