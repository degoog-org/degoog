export interface SearxLibStatus {
  module: string;
  package: string;
  missing: boolean;
}

export interface SearxCatalogItem {
  code: string;
  name: string;
  types: string[];
  site?: string;
  deps?: string[];
  installed: boolean;
  missingDeps: string[];
  libs: SearxLibStatus[];
}

export interface SearxCatalogGroup {
  key: string;
  label: string;
  items: SearxCatalogItem[];
}
