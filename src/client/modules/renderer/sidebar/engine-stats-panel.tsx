import { SidebarAccordion } from "../../../../shared/ui/components/layout/sidebar-accordion";
import { SidebarStatRow } from "./sidebar-stat-row";
import { state } from "../../../state";
import { DEGOOG_ENGINE_NAME } from "../../../../shared/search-types";
import { engineCount } from "../../../utils/search/engine-stats/engine-failure";
import { originSlot } from "../../../utils/search/engine-stats/engine-origins";
import type { EngineTimingWithPage } from "../../../utils/search/engine-stats/engine-stats";

const t = window.scopedT("themes/degoog");

export const EngineStatsPanel = ({
  timings,
}: {
  timings: EngineTimingWithPage[];
}): JSX.Element | null => {
  if (!state.displayEnginePerformance || timings.length === 0) return null;

  return (
    <SidebarAccordion
      title={t("search-templates.sidebar.engine-performance")}
      class="engine-performance-panel"
    >
      {timings.map((et) => {
        const isDegoog = et.name === DEGOOG_ENGINE_NAME;
        const failed = !!et.status && et.status !== "ok";
        const resultsLabel = t("search-templates.sidebar.results", {
          count: String(et.resultCount),
        });
        const count = isDegoog
          ? t("search-templates.sidebar.from-index", {
              count: String(et.resultCount),
            })
          : engineCount(et, resultsLabel);
        const failureText = et.failedPage
          ? ` · ${t("search-templates.sidebar.page-failed", { page: String(et.failedPage) })}`
          : "";
        return (
          <SidebarStatRow
            key={et.id ?? et.name}
            statusClass={!isDegoog && failed ? "engine-failed" : ""}
            origin={originSlot(et.name, et.id)}
            name={et.name}
            meta={[count, failureText, ` · ${et.time}ms`]}
            retryEngine={isDegoog ? undefined : (et.id ?? et.name)}
            retryPage={et.failedPage ?? state.currentPage}
            retryLabel={t("search-templates.sidebar.retry")}
          />
        );
      })}
    </SidebarAccordion>
  );
};
