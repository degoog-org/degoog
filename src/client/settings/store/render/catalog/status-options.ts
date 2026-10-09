import { hasUpdate } from "../../model";
import { st } from "../../format";
import type { StoreItem, StoreState, StoreStatus } from "../../../../types/store-tab";
import type { FilterOption } from "../../../shared/filter/filter-select";

const _opt = (value: StoreStatus, key: string, n?: number): FilterOption => ({
  value,
  label: st(key, n === undefined ? undefined : { count: n.toLocaleString() }),
});

export const statusOptions = (state: StoreState, scoped: StoreItem[]): FilterOption[] => {
  const updates = scoped.filter(hasUpdate).length;
  if (state.view === "installed") {
    const orphans = scoped.filter((i) => i.orphaned).length;
    return [
      _opt("all", "status-any"),
      _opt("updates", "status-updates", updates),
      ...(orphans || state.status === "orphaned"
        ? [_opt("orphaned", "status-orphaned", orphans)]
        : []),
    ];
  }
  const installed = scoped.filter((i) => i.installed).length;
  return [
    _opt("all", "status-any"),
    _opt("installed", "status-installed", installed),
    _opt("available", "status-available", scoped.length - installed),
    _opt("updates", "status-updates", updates),
  ];
};
