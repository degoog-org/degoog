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
    registerExtensionFolder(`transport-${name}`, folderName);
    if (instance.configure) {
      const stored = await getSettings(`transport-${name}`);
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

const _settingsId = (t: Transport): string => `transport-${t.name}`;

export async function getTransportExtensionMeta(): Promise<ExtensionMeta[]> {
  const results: ExtensionMeta[] = [];
  for (const t of _all()) {
    const schema = t.settingsSchema ?? [];
    const id = _settingsId(t);
    results.push(
      await buildExtensionMeta({
        id,
        displayName: t.displayName ?? t.name,
        description: t.description ?? "",
        type: ExtensionStoreType.Transport,
        schema,
        rawSettings: await getSettings(id),
      }),
    );
  }
  return results;
}

export async function initTransports(): Promise<void> {
  await registry.init();
}

export async function reloadTransports(): Promise<void> {
  await initTransports();
}
