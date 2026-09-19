export type {
  CompatCatalogItem,
  CompatRuntimeNeed,
  CompatLayerInfo,
} from "../../shared/compat-layers";

import type { CompatCatalogItem } from "../../shared/compat-layers";

export interface CompatCatalogGroup {
  key: string;
  label: string;
  items: CompatCatalogItem[];
}
