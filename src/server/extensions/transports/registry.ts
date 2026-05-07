import { Transport, ExtensionMeta, ExtensionStoreType } from "../../types";
import { FetchTransport } from "./builtins/fetch";
import { CurlTransport } from "./builtins/curl";
import { AutoTransport } from "./builtins/auto";
import {
  getSettings,
  dumbFallbackBecauseIDontThink,
  maskSecrets,
} from "../../utils/plugin-settings";
import { transportsDir } from "../../utils/paths";
import { createRegistry } from "../registry-factory";
import { extensionReadmeExists } from "../../utils/extension-docs";
import { stupidSettingIDtoAvoidConflicts } from "../extension-id";

const _builtins: Transport[] = [
  new FetchTransport(),
  new CurlTransport(),
  new AutoTransport(),
];

const _legacyNameByCanonical = new Map<string, string>();

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
  dirs: () => [{ dir: transportsDir(), source: "plugin" }],
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
    const legacyName = instance.name;
    const name = canonicalId ?? folderName;
    if (_builtins.some((t) => t.name === name)) return;
    instance.name = name;
    _legacyNameByCanonical.set(name, legacyName);
    if (instance.configure) {
      const { settingsId, fallbackSettingsIds } =
        stupidSettingIDtoAvoidConflicts({
          kind: "transport",
          canonicalId: instance.name,
          folderName,
          legacyDevId: legacyName,
        });

      const stored = await dumbFallbackBecauseIDontThink(
        settingsId,
        fallbackSettingsIds,
      );

      if (Object.keys(stored).length > 0) instance.configure(stored);
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

const _settingsId = (t: Transport): string => `transport-${t.name}`;

export async function getTransportExtensionMeta(): Promise<ExtensionMeta[]> {
  const results: ExtensionMeta[] = [];
  for (const t of _all()) {
    const schema = t.settingsSchema ?? [];
    const id = _settingsId(t);
    const legacy = _legacyNameByCanonical.get(t.name);
    const rawSettings =
      legacy && legacy !== t.name
        ? await dumbFallbackBecauseIDontThink(id, [`transport-${legacy}`])
        : await getSettings(id);
    const settings = maskSecrets(rawSettings, schema);
    if (rawSettings["disabled"]) settings["disabled"] = rawSettings["disabled"];
    const { exists } = await extensionReadmeExists(id);

    results.push({
      id,
      displayName: t.displayName ?? t.name,
      description: t.description ?? "",
      type: ExtensionStoreType.Transport,
      configurable: schema.length > 0,
      settingsSchema: schema,
      settings,
      extensionDocsAvailable: exists,
    });
  }
  return results;
}

export async function initTransports(): Promise<void> {
  await registry.init();
}

export async function reloadTransports(): Promise<void> {
  await initTransports();
}
