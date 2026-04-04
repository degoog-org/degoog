import type { Transport } from "./types";
import { ExtensionStoreType, type ExtensionMeta } from "../../types";
import { FetchTransport } from "./builtins/fetch";
import { CurlTransport } from "./builtins/curl";
import { AutoTransport } from "./builtins/auto";
import { getSettings, maskSecrets } from "../../utils/plugin-settings";
import { debug } from "../../utils/logger";

const _builtins: Transport[] = [
  new FetchTransport(),
  new CurlTransport(),
  new AutoTransport(),
];

let _custom: Transport[] = [];

const _all = (): Transport[] => [..._builtins, ..._custom];

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
    const rawSettings = await getSettings(id);
    const settings = maskSecrets(rawSettings, schema);
    if (rawSettings["disabled"]) settings["disabled"] = rawSettings["disabled"];

    results.push({
      id,
      displayName: t.displayName ?? t.name,
      description: t.description ?? "",
      type: ExtensionStoreType.Transport,
      configurable: schema.length > 0,
      settingsSchema: schema,
      settings,
    });
  }
  return results;
}

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

export async function initTransports(): Promise<void> {
  _custom = [];

  const { readdir, stat } = await import("fs/promises");
  const { join } = await import("path");
  const { pathToFileURL } = await import("url");

  const { transportsDir: getTransportsDir } = await import("../../utils/paths");
  const transportsDir = getTransportsDir();
  const seen = new Set<string>(_builtins.map((t) => t.name));

  try {
    const entries = await readdir(transportsDir, { withFileTypes: true });
    for (const entry of entries) {
      let fullPath: string;
      let base: string;

      if (entry.isFile() && /\.(js|ts|mjs|cjs)$/.test(entry.name)) {
        base = entry.name.replace(/\.(js|ts|mjs|cjs)$/, "");
        fullPath = join(transportsDir, entry.name);
      } else if (entry.isDirectory()) {
        let indexFile: string | undefined;
        for (const f of ["index.js", "index.ts", "index.mjs", "index.cjs"]) {
          try {
            const s = await stat(join(transportsDir, entry.name, f));
            if (s.isFile()) {
              indexFile = f;
              break;
            }
          } catch {}
        }
        if (!indexFile) continue;
        base = entry.name;
        fullPath = join(transportsDir, entry.name, indexFile);
      } else {
        continue;
      }

      if (seen.has(base)) continue;
      seen.add(base);

      try {
        const url = pathToFileURL(fullPath).href;
        const mod = await import(url);
        const Export = mod.default ?? mod.transport ?? mod.Transport;
        const instance: Transport =
          typeof Export === "function" ? new Export() : Export;
        if (!_isTransport(instance)) continue;
        _custom.push(instance);

        if (instance.configure) {
          const stored = await getSettings(_settingsId(instance));
          if (Object.keys(stored).length > 0) instance.configure(stored);
        }

        debug("transports", `loaded custom transport: ${instance.name}`);
      } catch (err) {
        debug("transports", `failed to load transport: ${base}`, err);
      }
    }
  } catch {}
}

export async function reloadTransports(): Promise<void> {
  await initTransports();
}
