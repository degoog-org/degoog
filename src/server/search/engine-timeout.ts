import { getEngineDefaultTransport } from "../extensions/engines/catalog";
import { ENGINE_TIMEOUT_MS } from "../extensions/engines/setting-fields";
import { resolveTransport } from "../extensions/transports/registry";
import { parseOutgoingTransport } from "../utils/net/outgoing";
import { asString, getSettings } from "../utils/settings/plugin-settings";

export const ENGINE_TIMEOUT_BUFFER_MS = 5000;
export const ENGINE_TIMEOUT_MIN_MS = 10;
export const ENGINE_TIMEOUT_MAX_MS = 10 * 60 * 1000;

const clampTimeout = (ms: number): number =>
  Math.min(Math.max(ms, ENGINE_TIMEOUT_MIN_MS), ENGINE_TIMEOUT_MAX_MS);

export const getEngineTimeout = async (
  engineSettingsId: string | undefined,
): Promise<number> => {
  if (!engineSettingsId) return clampTimeout(ENGINE_TIMEOUT_MS);
  const stored = await getSettings(engineSettingsId);
  const configured = parseInt(asString(stored.timeoutMs), 10);
  const base =
    Number.isFinite(configured) && configured > 0
      ? configured
      : ENGINE_TIMEOUT_MS;
  let raw = asString(stored.outgoingTransport) || undefined;
  if (!raw) raw = getEngineDefaultTransport(engineSettingsId) ?? undefined;
  const transportName = parseOutgoingTransport(raw);
  const transport = resolveTransport(transportName);
  if (transport.timeoutMs && transport.timeoutMs > base) {
    return clampTimeout(transport.timeoutMs + ENGINE_TIMEOUT_BUFFER_MS);
  }
  return clampTimeout(base);
};
