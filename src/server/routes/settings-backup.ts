import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  applySettingsBatch,
  type SettingsSaveResult,
} from "../utils/settings/settings-write";
import { applyInstance } from "../utils/settings/settings-backup-instance";
import {
  restoreExtensions,
  type ExtensionsRestoreResult,
} from "../utils/settings/settings-backup-extensions";
import { applyAliases } from "../utils/settings/settings-backup-aliases";
import { applySources } from "../utils/settings/settings-backup-shortcuts";
import {
  buildBackup,
  isEmptyBackup,
  parseBackup,
  type BackupContents,
} from "../utils/settings/settings-backup-format";
import { logger } from "../utils/logger";
import {
  BackupError,
  BackupStage,
  MAX_SETTINGS_BACKUP_BYTES,
  weigh,
} from "../../shared/settings-backup";
import { settingsAuth } from "./_guards";

const router = new Hono();

const TAG = "settings-backup";

type RestoreTally = {
  instanceApplied: number;
  reposAdded: number;
  extensionsInstalled: number;
  extensionsFailed: string[];
  aliasesRestored: number;
  shortcutsRestored: number;
  failedStages: BackupStage[];
};

const _filename = (): string =>
  `degoog-settings-${new Date().toISOString().slice(0, 10)}.json`;

const _tooLarge = (bytes: number): boolean =>
  bytes > MAX_SETTINGS_BACKUP_BYTES;

router.get("/api/settings/export", settingsAuth("GET /api/settings/export"), async (c) => {

  const body = JSON.stringify(await buildBackup(), null, 2);
  const bytes = weigh(body);
  if (_tooLarge(bytes)) {
    logger.error(
      TAG,
      `refusing to export ${bytes} bytes; the limit both ends agree on is ${MAX_SETTINGS_BACKUP_BYTES}`,
    );
    return c.json({ error: "Backup too large", code: BackupError.TooLarge }, 413);
  }

  const name = _filename();
  return c.body(body, 200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Content-Length": String(bytes),
    "Cache-Control": "no-store",
  });
});

const _stage = async <T>(
  stage: BackupStage,
  failed: BackupStage[],
  fallback: T,
  run: () => Promise<T>,
): Promise<T> => {
  try {
    return await run();
  } catch (err) {
    logger.error(TAG, `restoring ${stage} from a backup failed`, err);
    failed.push(stage);
    return fallback;
  }
};

const _restoreRest = async (
  backup: BackupContents,
  instanceApplied: number,
): Promise<RestoreTally> => {
  const failedStages: BackupStage[] = [];
  const extensions = await _stage<ExtensionsRestoreResult>(
    BackupStage.Extensions,
    failedStages,
    { reposAdded: 0, extensionsInstalled: 0, extensionsFailed: [] },
    () => restoreExtensions(backup.extensions),
  );
  const aliasesRestored = await _stage(BackupStage.Aliases, failedStages, 0, () =>
    applyAliases(backup.aliases),
  );
  const shortcutsRestored = await _stage(
    BackupStage.Shortcuts,
    failedStages,
    0,
    () => applySources(backup.shortcutSources),
  );
  return {
    instanceApplied,
    aliasesRestored,
    shortcutsRestored,
    failedStages,
    ...extensions,
  };
};

router.post(
  "/api/settings/import",
  bodyLimit({
    maxSize: MAX_SETTINGS_BACKUP_BYTES,
    onError: (c) =>
      c.json({ error: "Backup too large", code: BackupError.TooLarge }, 413),
  }),
  settingsAuth("POST /api/settings/import"),
  async (c) => {

    const raw = await c.req.text();
    if (_tooLarge(weigh(raw)))
      return c.json({ error: "Backup too large", code: BackupError.TooLarge }, 413);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      logger.warn(TAG, "import body is not JSON", err);
      return c.json({ error: "Invalid JSON", code: BackupError.InvalidJson }, 400);
    }

    const backup = parseBackup(parsed);
    if (!backup)
      return c.json(
        { error: "Not a Degoog settings backup", code: BackupError.Unrecognised },
        400,
      );
    if (isEmptyBackup(backup))
      return c.json(
        { error: "Backup has nothing this build knows", code: BackupError.Empty },
        400,
      );

    const applied = Object.keys(backup.settings).length;
    let instanceApplied = 0;
    let result: SettingsSaveResult;
    try {
      result = await applySettingsBatch(backup.settings, async () => {
        instanceApplied = await applyInstance(backup.instance);
      });
    } catch (err) {
      logger.error(TAG, "settings restore failed and was rolled back", err);
      return c.json(
        {
          error: "Could not write the settings",
          code: BackupError.WriteFailed,
          failedStages: [BackupStage.Settings],
        },
        500,
      );
    }

    const tally = await _restoreRest(backup, instanceApplied);
    logger.info(
      TAG,
      `restored ${applied} settings, ${tally.instanceApplied} instance defaults, ${tally.reposAdded} repos, ${tally.extensionsInstalled} extensions, ${tally.aliasesRestored} aliases and ${tally.shortcutsRestored} shortcuts from a backup`,
    );
    return c.json({ ...result, ...tally, applied });
  },
);

export default router;
