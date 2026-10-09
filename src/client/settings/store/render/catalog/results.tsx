import { Button } from "../../../../../shared/ui/components/primitives/button";
import { KindGroup } from "./kind-group";
import { STORE_KINDS } from "../../model";
import { st } from "../../format";
import type { StoreActions, StoreItem, StoreState } from "../../../../types/store-tab";

const _emptyText = (state: StoreState, filtered: boolean): string => {
  const q = state.q.trim();
  if (state.view === "installed" && !filtered) return st("nothing-installed");
  return q ? st("no-match-query", { q }) : st("no-match-filters");
};

export const Results = ({
  list,
  state,
  actions,
}: {
  list: StoreItem[];
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const q = state.q.trim();
  if (!list.length) {
    const filtered = !!(q || state.sub || state.repoSel.length || state.status !== "all");
    return (
      <div class="store-results">
        <div class="store-empty">
          <p>{_emptyText(state, filtered)}</p>
          {filtered ? (
            <Button variant="secondary" class="degoog-btn--sm" onClick={actions.clearFilters}>
              {st("clear-filters")}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
  const preview = state.kind === "all" && !q;
  return (
    <div class="store-results">
      {STORE_KINDS.map((kind) => {
        const items = list.filter((item) => item.type === kind);
        return items.length ? (
          <KindGroup
            key={kind}
            kind={kind}
            items={items}
            preview={preview}
            state={state}
            actions={actions}
          />
        ) : null;
      })}
    </div>
  );
};
