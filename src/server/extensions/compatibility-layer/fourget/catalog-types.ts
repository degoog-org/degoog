export interface FourGetCatalogEntry {
  code: string;
  name: string;
  types: string[];
  site?: string;
  deps?: string[];
  needsApiKey?: boolean;
  wantsImpersonation?: boolean;
}
