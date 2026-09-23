import type { CompatCatalogItem } from "../../shared/compat-layers";

export interface CompatCatalogGroup {
  key: string;
  label: string;
  items: CompatCatalogItem[];
}
