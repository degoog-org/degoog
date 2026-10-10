import { AttentionPanel } from "./attention/attention-panel";
import { FilterBar } from "./catalog/filter-bar";
import { Results } from "./catalog/results";
import { Lightbox } from "./lightbox";
import { ReposView } from "./repos/repos-view";
import { ViewsSwitch } from "./views-switch";
import { passes, scopeItems, sortItems } from "../model";
import { itemSubLabel } from "./labels";
import type { StoreActions, StoreState } from "../../../types/store-tab";

const CATALOG_VIEW_ID = "store-catalog-view";

export const StoreRoot = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const list =
    state.view === "repos"
      ? []
      : scopeItems(state)
          .filter((item) => passes(state, item, itemSubLabel(item)))
          .sort(sortItems);
  return (
    <div class="store">
      <AttentionPanel state={state} actions={actions} />
      <ViewsSwitch state={state} actions={actions} />
      {state.view === "repos" ? (
        <ReposView state={state} actions={actions} />
      ) : (
        <div id={CATALOG_VIEW_ID}>
          <FilterBar state={state} count={list.length} actions={actions} />
          <Results list={list} state={state} actions={actions} />
        </div>
      )}
      <Lightbox lightbox={state.lightbox} actions={actions} />
    </div>
  );
};
