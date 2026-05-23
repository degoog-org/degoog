import { readFile, writeFile, rename } from "fs/promises";
import { logger } from "../utils/logger";
import { pluginSettingsFile } from "../utils/paths";

export const MIGRATION_VERSION = 52026 as const;

const STAMP_KEY = "__builtinMigrationsAt";

const BUILTIN_MOVES: Array<{ from: string; to: string }> = [
  {
    from: "ai-summary-slot",
    to: "fccview-degoog-extensions-ai-summary-slot",
  },
];

export const runBuiltinMigrations052026 = async (): Promise<void> => {
  const settingsPath = pluginSettingsFile();
  let raw: string;
  try {
    raw = await readFile(settingsPath, "utf-8");
  } catch {
    return;
  }

  let store: Record<string, unknown>;
  try {
    store = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    logger.error(
      "migrations:builtin",
      "failed to parse plugin-settings.json",
      err,
    );
    return;
  }

  if (store[STAMP_KEY]) return;

  let changed = false;
  for (const { from, to } of BUILTIN_MOVES) {
    if (from in store && !(to in store)) {
      store[to] = store[from];
      delete store[from];
      changed = true;
      logger.info("migrations:builtin", `moved settings key ${from} -> ${to}`);
    }
  }

  if (!changed) {
    store[STAMP_KEY] = new Date().toISOString();
    const out = JSON.stringify(store, null, 2);
    await writeFile(settingsPath, out, "utf-8");
    return;
  }

  store[STAMP_KEY] = new Date().toISOString();
  const updated = JSON.stringify(store, null, 2);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${settingsPath}.bak-${ts}`;
  await writeFile(backupPath, raw, "utf-8");

  const tmpPath = `${settingsPath}.tmp`;
  await writeFile(tmpPath, updated, "utf-8");
  await rename(tmpPath, settingsPath);

  logger.info(
    "migrations:builtin",
    "builtin-migrations complete, backup at",
    backupPath,
  );
};
