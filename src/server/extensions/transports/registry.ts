import { Transport, ExtensionMeta, ExtensionStoreType } from "../../types";
import { FetchTransport } from "./builtins/fetch";
import { CurlTransport } from "./builtins/curl";
import { CurlImpersonateTransport } from "./builtins/curl-impersonate";
import { AutoTransport } from "./builtins/auto";
import { getSettings } from "../../utils/plugin-settings";
import { transportsDir } from "../../utils/paths";
import { createRegistry } from "../registry-factory";
import { registerExtensionFolder } from "../../utils/extension-docs";
import { buildExtensionMeta } from "../extension-meta";
import { mountTransportWs } from "./ws-registry";
import { getTransportWsSession } from "./ws-session";
import { isExtensionRestartFlagVisible } from "../../utils/restart-state";

const _builtins: Transport[] = [
  new FetchTransport(),
  new CurlTransport(),
  new CurlImpersonateTransport(),
  new AutoTransport(),
];

function _isTransport(val: unknown): val is Transport {
  return (
    typeof val === "object" &&
    val !== null &&
    "name" in val &&
    typeof (val as Transport).name === "string" &&
    "fetch" in val &&
    typeof (val as Transport).fetch === "function" &&
    "available" in val &&
    typeof (val as Transport).available === "function"
  );
}

const registry = createRegistry<Transport>({
  dirs: () => [{ dir: transportsDir() }],
  match: (mod) => {
    const Export = mod.default ?? mod.transport ?? mod.Transport;
    const instance: Transport =
      typeof Export === "function"
        ? new (Export as new () => Transport)()
        : (Export as Transport);
    if (!_isTransport(instance)) return null;
    return instance;
  },
  canonicalIdKind: "transport",
  onLoad: async (instance, { folderName, canonicalId }) => {
    const name = canonicalId ?? folderName;
    if (_builtins.some((t) => t.name === name)) return false;
    instance.name = name;
    registerExtensionFolder(name, folderName);
    if (instance.configure) {
      const stored = await getSettings(name);
      if (Object.keys(stored).length > 0) instance.configure(stored);
    }
    if (instance.wsHandler) {
      const bindWsSession = (
        instance as Transport & {
          bindWsSession?: (session: ReturnType<typeof getTransportWsSession>) => void;
        }
      ).bindWsSession;
      if (bindWsSession) bindWsSession.call(instance, getTransportWsSession(name));
      mountTransportWs(name, instance.wsHandler);
    }
  },
  allowFlatFiles: true,
  debugTag: "transports",
});

const _all = (): Transport[] => [..._builtins, ...registry.items()];

export function getTransport(name: string): Transport | undefined {
  return _all().find((t) => t.name === name);
}

export function getTransportNames(): string[] {
  return _all().map((t) => t.name);
}

export function getTransportDisplayNames(): string[] {
  return _all().map((t) => t.displayName ?? t.name);
}

export const getAvailableTransportNames = async (): Promise<string[]> => {
  const results: string[] = [];
  for (const t of _all()) {
    if (await t.available()) results.push(t.name);
  }
  return results;
};

export function getFallbackTransport(): Transport {
  return _builtins[0];
}

export function resolveTransport(name: string | undefined): Transport {
  if (!name) return getFallbackTransport();
  return getTransport(name) ?? getFallbackTransport();
}

export const getTransportSettingsId = (t: Pick<Transport, "name">): string =>
  t.name;

export async function getTransportExtensionMeta(): Promise<ExtensionMeta[]> {
  const results: ExtensionMeta[] = [];
  for (const t of _all()) {
    const schema = t.settingsSchema ?? [];
    const id = getTransportSettingsId(t);
    results.push(
      await buildExtensionMeta({
        id,
        displayName: t.displayName ?? t.name,
        description: t.description ?? "",
        type: ExtensionStoreType.Transport,
        schema,
        rawSettings: await getSettings(id),
        extra: { needsAppRestart: isExtensionRestartFlagVisible(t.needsAppRestart) },
      }),
    );
  }
  return results;
}

export async function initTransports(bust = false): Promise<void> {
  await (bust ? registry.reload() : registry.init());
}

export async function reloadTransports(bust = true): Promise<void> {
  await initTransports(bust);
}
