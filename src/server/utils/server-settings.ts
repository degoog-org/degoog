import { readFile } from "fs/promises";
import { randomBytes } from "crypto";
import { logger } from "./logger";
import { serverSettingsFile } from "./paths";
import { writeJsonAtomic } from "./atomic-json";
import {
  INVALIDATE_SCOPE,
  onInvalidate,
  publishInvalidate,
} from "./cache-valkey";

export const WIZARD_ENV_VAR = "DEGOOG_WIZARD";

export type ServerSettingValue = string | string[] | boolean;

export interface ServerSettings {
  wizard: boolean;
  instanceId: string;
  settings: Record<string, ServerSettingValue>;
}

const _defaults = (): ServerSettings => ({
  wizard: false,
  instanceId: randomBytes(16).toString("hex"),
  settings: {},
});

let _cache: ServerSettings | null = null;

onInvalidate((payload) => {
  if (payload.scope !== INVALIDATE_SCOPE.SERVER_SETTINGS) return;
  _cache = null;
});

const _persist = async (settings: ServerSettings): Promise<void> => {
  await writeJsonAtomic(serverSettingsFile(), settings);
};

export const readServerSettings = async (): Promise<ServerSettings> => {
  if (_cache) return _cache;
  try {
    const raw = await readFile(serverSettingsFile(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<ServerSettings>;
    const merged: ServerSettings = {
      wizard: parsed.wizard === true,
      instanceId:
        typeof parsed.instanceId === "string" && parsed.instanceId.trim()
          ? parsed.instanceId
          : _defaults().instanceId,
      settings:
        parsed.settings && typeof parsed.settings === "object" && !Array.isArray(parsed.settings)
          ? (parsed.settings as Record<string, ServerSettingValue>)
          : {},
    };
    if (!parsed.instanceId) {
      await _persist(merged).catch((err) =>
        logger.error("server-settings", "failed to persist generated instanceId", err),
      );
    }
    _cache = merged;
    return merged;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      logger.error("server-settings", "failed to read server-settings.json", err);
    }
    const fresh = _defaults();
    await _persist(fresh).catch((e) =>
      logger.error("server-settings", "failed to write initial server-settings.json", e),
    );
    _cache = fresh;
    return fresh;
  }
};

export const writeServerSettings = async (
  patch: Partial<ServerSettings>,
): Promise<ServerSettings> => {
  const current = await readServerSettings();
  const next: ServerSettings = {
    wizard: typeof patch.wizard === "boolean" ? patch.wizard : current.wizard,
    instanceId:
      typeof patch.instanceId === "string" && patch.instanceId.trim()
        ? patch.instanceId
        : current.instanceId,
    settings:
      patch.settings && typeof patch.settings === "object" && !Array.isArray(patch.settings)
        ? patch.settings
        : current.settings,
  };
  await _persist(next);
  _cache = next;
  await publishInvalidate(INVALIDATE_SCOPE.SERVER_SETTINGS);
  return next;
};

export const getInstanceSettings = async (): Promise<Record<string, ServerSettingValue>> => {
  const s = await readServerSettings();
  return s.settings ?? {};
};

export const setInstanceSettings = async (
  next: Record<string, ServerSettingValue>,
): Promise<void> => {
  await writeServerSettings({ settings: next });
};

export const updateInstanceSettings = async (
  patch: Record<string, ServerSettingValue>,
): Promise<void> => {
  const current = await getInstanceSettings();
  await setInstanceSettings({ ...current, ...patch });
};

export const isWizardActive = async (): Promise<boolean> => {
  if (String(process.env[WIZARD_ENV_VAR] ?? "").toLowerCase() === "false") return false;
  const s = await readServerSettings();
  return s.wizard !== true;
};

export const getInstanceId = async (): Promise<string> => {
  const s = await readServerSettings();
  return s.instanceId;
};
