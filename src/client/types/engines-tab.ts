import type { ExtensionMeta } from "./extension";

export interface TypeEntry {
  key: string;
  label: string;
}

export type GroupEntry = { key: string; label: string; engines: ExtensionMeta[] };
