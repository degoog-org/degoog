import { FilterSearch } from "./filter-search";
import { FilterSelect } from "./filter-select";
import { FilterSummary } from "./filter-summary";
import { FilterTabs } from "./filter-tabs";
import { FilterToggle } from "./filter-toggle";
import { extMatches, isFiltered, type IsOn } from "./ext-filter";
import type {
  ExtFilter,
  ExtFilterActions,
  ExtFilterGroup,
  ExtStatusFilter,
} from "../../../types/ext-filter";

const t = window.scopedT("core");

const ft = (key: string, vars?: Record<string, string>): string =>
  t(`settings-page.ext-filter.${key}`, vars);

const _count = (noun: string, n: number): string =>
  ft(`${noun}-${n === 1 ? "one" : "many"}`, { count: n.toLocaleString() });

export interface ExtFilterIds {
  search: string;
  tabs: string;
  selects: string;
}

export const extFilterIds = (prefix: string): ExtFilterIds => ({
  search: `${prefix}-q`,
  tabs: `${prefix}-types`,
  selects: `${prefix}-selects`,
});

export const ExtFilterBar = ({
  noun,
  ids,
  groups,
  shown,
  filter,
  isOn,
  actions,
}: {
  noun: string;
  ids: ExtFilterIds;
  groups: ExtFilterGroup[];
  shown: number;
  filter: ExtFilter;
  isOn: IsOn;
  actions: ExtFilterActions;
}): JSX.Element => {
  const inType = groups
    .filter((g) => filter.type === "all" || g.key === filter.type)
    .flatMap((g) => g.items)
    .filter((ext) => extMatches(ext, filter, isOn, false));
  const on = inType.filter(isOn).length;
  const typeCount = (group: ExtFilterGroup): number =>
    group.items.filter((ext) => extMatches(ext, filter, isOn)).length;
  const q = filter.q.trim();
  const parts = [
    q ? ft("sub-matching", { q }) : "",
    filter.status === "all" ? "" : ft(`sub-${filter.status}`),
  ].filter(Boolean);
  return (
    <div class="filter-bar-wrap">
      <div class={filter.open ? "filter-bar filter-bar--open" : "filter-bar"}>
        <div class="filter-bar-top">
          <FilterSearch
            id={ids.search}
            placeholder={ft(`search-${noun}`)}
            clearLabel={ft("search-clear-aria")}
            value={filter.q}
            onInput={actions.setQuery}
            onClear={actions.clearQuery}
          />
          <FilterToggle
            label={ft("filters")}
            active={filter.status === "all" ? 0 : 1}
            open={filter.open}
            controls={ids.selects}
            onToggle={actions.toggleOpen}
          />
          <div class="filter-selects" id={ids.selects}>
            <FilterSelect
              label={ft("status-aria")}
              value={filter.status}
              isSet={filter.status !== "all"}
              onChange={(value) => actions.setStatus(value as ExtStatusFilter)}
              options={[
                { value: "all", label: ft("status-any") },
                { value: "on", label: ft("status-on", { count: on.toLocaleString() }) },
                {
                  value: "off",
                  label: ft("status-off", { count: (inType.length - on).toLocaleString() }),
                },
              ]}
            />
          </div>
        </div>
        <FilterTabs
          id={ids.tabs}
          label={ft("types-aria")}
          value={filter.type}
          onSelect={actions.setType}
          tabs={[
            {
              value: "all",
              label: ft("all"),
              count: groups.reduce((n, g) => n + typeCount(g), 0),
            },
            ...groups.map((g) => ({ value: g.key, label: g.label, count: typeCount(g) })),
          ]}
        />
        {isFiltered(filter) ? (
          <FilterSummary clearLabel={ft("clear")} onClear={actions.clear}>
            {[_count(noun, shown), parts.join(", ")].join(" ")}
          </FilterSummary>
        ) : null}
      </div>
    </div>
  );
};
