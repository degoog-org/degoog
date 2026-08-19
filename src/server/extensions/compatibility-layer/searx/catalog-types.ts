import type { PythonLib } from "./python-deps";

export interface SearxCatalogEntry {
  code: string;
  name: string;
  types: string[];
  site?: string;
  deps?: string[];
  libs?: readonly PythonLib[];
}

export interface SearxSharedFile {
  code: string;
  libs?: readonly PythonLib[];
}

export interface SearxLibStatus {
  module: string;
  package: string;
  missing: boolean;
}

export interface SearxCatalogItem extends Omit<SearxCatalogEntry, "libs"> {
  installed: boolean;
  missingDeps: string[];
  libs: SearxLibStatus[];
}
