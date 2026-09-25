import type { Child } from "../../../../shared/ui/tribute/types";
import { EngineStatReason } from "../../../../server/nojs/sidebar/engine-stat-reason";
import type { EngineTiming } from "../../../../shared/search-types";

const t = window.scopedT("themes/degoog");

export const engineFailureText = (et: EngineTiming): string => {
  if (!et.status || et.status === "ok") return "";
  const key = `search-templates.sidebar.failure-reasons.${et.status}`;
  const mapped = t(key);
  const base =
    mapped === key
      ? t("search-templates.sidebar.failure-reasons.unknown")
      : mapped;
  return et.httpStatus ? `${base} (${et.httpStatus})` : base;
};

export const engineCount = (et: EngineTiming, label: string): Child => {
  const reason = engineFailureText(et);
  if (!reason) return label;
  return <EngineStatReason reason={reason} label={label} />;
};
