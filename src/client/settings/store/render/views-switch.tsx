import { inCatalog } from "../model";
import { st } from "../format";
import type { StoreActions, StoreState, StoreView } from "../../../types/store-tab";

const _label = (view: StoreView): JSX.Element =>
  view === "repos" ? (
    <>
      <span class="store-view-full">{st("view-repos")}</span>
      <span class="store-view-short">{st("view-repos-short")}</span>
    </>
  ) : (
    <>{st(`view-${view}`)}</>
  );

export const ViewsSwitch = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const counts: Record<StoreView, number> = {
    browse: state.items.filter((i) => inCatalog(state, i)).length,
    installed: state.items.filter((i) => i.installed).length,
    repos: state.repos.length,
  };
  const failing = state.repos.some((r) => r.error);
  return (
    <div class="store-views" role="tablist" aria-label={st("views-aria")}>
      {(Object.keys(counts) as StoreView[]).map((view) => (
        <button
          key={view}
          type="button"
          role="tab"
          class={state.view === view ? "store-view-btn active" : "store-view-btn"}
          data-view={view}
          aria-selected={String(state.view === view)}
          onClick={() => actions.setView(view)}
        >
          <span class="store-view-label">{_label(view)}</span>
          <span class="store-view-count">{counts[view].toLocaleString()}</span>
          {view === "repos" && failing ? (
            <i
              class="fa-solid fa-circle-exclamation store-view-err"
              aria-label={st("repo-error-aria")}
            ></i>
          ) : null}
        </button>
      ))}
    </div>
  );
};
