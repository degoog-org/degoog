import { ExtensionStoreType } from "../../types/extension";
import {
  INVALIDATE_SCOPE,
  isOwnEvent,
  onInvalidate,
  publishInvalidate,
  type InvalidatePayload,
} from "../../utils/cache/cache-valkey";
import { logger } from "../../utils/logger";
import { bumpPluginRegistryReload } from "../registry-factory";
import { STORE_TYPE_SPECS } from "./store-types";

export enum ReloadMode {
  Bump = "bump",
  Bust = "bust",
  Refresh = "refresh",
}

interface ReloadTarget {
  type: ExtensionStoreType;
  mode: ReloadMode;
}

const NS = "reload-sync";
const KEY_SEPARATOR = ":";

const STORE_TYPES = new Set<string>(Object.values(ExtensionStoreType));
const RELOAD_MODES = new Set<string>(Object.values(ReloadMode));

export const toReloadKey = ({ type, mode }: ReloadTarget): string =>
  `${type}${KEY_SEPARATOR}${mode}`;

export const parseReloadKey = (key?: string): ReloadTarget | null => {
  const [type, mode] = (key ?? "").split(KEY_SEPARATOR);
  if (!STORE_TYPES.has(type) || !RELOAD_MODES.has(mode)) return null;
  return { type: type as ExtensionStoreType, mode: mode as ReloadMode };
};

const runReload = async ({ type, mode }: ReloadTarget): Promise<void> => {
  if (mode === ReloadMode.Bump) bumpPluginRegistryReload();
  await STORE_TYPE_SPECS[type].reload(mode !== ReloadMode.Refresh);
};

export const reloadSync = async (
  type: ExtensionStoreType,
  mode: ReloadMode,
): Promise<void> => {
  const target = { type, mode };
  try {
    await runReload(target);
  } finally {
    await publishInvalidate(INVALIDATE_SCOPE.EXTENSIONS, toReloadKey(target));
  }
};

export const heimdall = (payload: InvalidatePayload): void => {
  if (payload.scope !== INVALIDATE_SCOPE.EXTENSIONS || isOwnEvent(payload)) {
    return;
  }

  const target = parseReloadKey(payload.key);
  if (!target) {
    logger.warn(NS, `ignoring unknown extension reload key=${payload.key}`);
    return;
  }

  runReload(target).catch((err) =>
    logger.error(NS, `peer reload failed type=${target.type}`, err),
  );
};

export const openBifrost = (): (() => void) => onInvalidate(heimdall);
