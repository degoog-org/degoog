import {
  INVALIDATE_SCOPE,
  isOwnEvent,
  onInvalidate,
  publishInvalidate,
  type InvalidatePayload,
} from "../utils/cache/cache-valkey";
import { logger } from "../utils/logger";
import { getSettings, type SettingValue } from "../utils/settings/plugin-settings";
import { reconfigureManifestEngines } from "./engines/catalog";
import { resolveExtension } from "./resolve";

type ExtSettings = Record<string, SettingValue>;

const NS = "settings-sync";

const applyExtSettings = (id: string, settings: ExtSettings): void => {
  const resolved = resolveExtension(id);
  if (!resolved.engine?.pluginManifest) resolved.engine?.configure?.(settings);
  resolved.command?.configure?.(settings);
  resolved.slot?.configure?.(settings);
  resolved.interceptor?.configure?.(settings);
  resolved.tab?.configure?.(settings);
  resolved.transport?.configure?.(settings);
  resolved.autocomplete?.configure?.(settings);

  if (settings.priority === undefined) return;

  const parsed = parseInt(String(settings.priority), 10);
  const priority = isNaN(parsed) ? 0 : parsed;
  if (resolved.slot) resolved.slot.priority = priority;
  if (resolved.interceptor) resolved.interceptor.priority = priority;
};

export const syncExtSettings = async (
  id: string,
  settings: ExtSettings,
): Promise<void> => {
  applyExtSettings(id, settings);
  await reconfigureManifestEngines(id);
  await publishInvalidate(INVALIDATE_SCOPE.EXTENSION_SETTINGS, id);
};

const reapplyStored = async (id: string): Promise<void> => {
  applyExtSettings(id, await getSettings(id));
  await reconfigureManifestEngines(id);
};

export const palantir = (payload: InvalidatePayload): void => {
  if (
    payload.scope !== INVALIDATE_SCOPE.EXTENSION_SETTINGS ||
    isOwnEvent(payload)
  ) {
    return;
  }

  const id = payload.key;
  if (!id) {
    logger.warn(NS, "ignoring settings event without an extension id");
    return;
  }

  reapplyStored(id).catch((err) =>
    logger.error(NS, `failed to apply synced settings for ${id}`, err),
  );
};

export const openPalantir = (): (() => void) => onInvalidate(palantir);
