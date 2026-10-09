import { FilterSearch } from "../../../shared/filter/filter-search";
import { FilterSelect } from "../../../shared/filter/filter-select";
import { FilterToggle } from "../../../shared/filter/filter-toggle";
import { KindTabs } from "./kind-tabs";
import { RepoFilter } from "./repo-filter";
import { Substatus } from "./substatus";
import { statusOptions } from "./status-options";
import { inRepoSelection, kindSubtypes, scopeItems } from "../../model";
import { subtypeLabel } from "../labels";
import { st } from "../../format";
import type { StoreActions, StoreState, StoreStatus } from "../../../../types/store-tab";

export const SEARCH_ID = "store-q";
const SELECTS_ID = "store-selects";

const _SubSelect = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element | null => {
  if (state.kind !== "engine" && state.kind !== "plugin") return null;
  const kind = state.kind;
  const subs = kindSubtypes(state).sort((a, b) =>
    subtypeLabel(kind, a).localeCompare(subtypeLabel(kind, b)),
  );
  if (!subs.length) return null;
  return (
    <FilterSelect
      label={st(`${kind}-type-aria`)}
      value={state.sub}
      isSet={!!state.sub}
      onChange={actions.setSub}
      options={[
        { value: "", label: st(`all-${kind}-types`) },
        ...subs.map((sub) => ({ value: sub, label: subtypeLabel(kind, sub) })),
      ]}
    />
  );
};

export const FilterBar = ({
  state,
  count,
  actions,
}: {
  state: StoreState;
  count: number;
  actions: StoreActions;
}): JSX.Element => {
  const active = [state.sub, state.status !== "all", state.repoSel.length].filter(Boolean).length;
  const scoped = scopeItems(state).filter((item) => inRepoSelection(state, item));
  return (
    <div class="filter-bar-wrap">
      <div class={state.filtersOpen ? "filter-bar filter-bar--open" : "filter-bar"}>
        <div class="filter-bar-top">
          <FilterSearch
            id={SEARCH_ID}
            placeholder={st("search-placeholder")}
            clearLabel={st("search-clear-aria")}
            value={state.q}
            onInput={actions.setQuery}
            onClear={actions.clearQuery}
          />
          <FilterToggle
            label={st("filters")}
            active={active}
            open={state.filtersOpen}
            controls={SELECTS_ID}
            onToggle={actions.toggleFilters}
          />
          <div class="filter-selects" id={SELECTS_ID}>
            <_SubSelect state={state} actions={actions} />
            <FilterSelect
              label={st("status-aria")}
              value={state.status}
              isSet={state.status !== "all"}
              onChange={(value) => actions.setStatus(value as StoreStatus)}
              options={statusOptions(state, scoped)}
            />
            <RepoFilter state={state} actions={actions} />
          </div>
        </div>
        <KindTabs state={state} actions={actions} />
        <Substatus state={state} count={count} actions={actions} />
      </div>
    </div>
  );
};
