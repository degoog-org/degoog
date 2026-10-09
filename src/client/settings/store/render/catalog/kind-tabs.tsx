import { FilterTabs } from "../../../shared/filter/filter-tabs";
import { STORE_KINDS, passes, scopeItems } from "../../model";
import { itemSubLabel, kindsLabel } from "../labels";
import { st } from "../../format";
import type { StoreActions, StoreKind, StoreState } from "../../../../types/store-tab";

export const KIND_TABS_ID = "store-kinds";

export const KindTabs = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const scoped = scopeItems(state).filter((item) =>
    passes(state, item, itemSubLabel(item), false),
  );
  return (
    <FilterTabs
      id={KIND_TABS_ID}
      label={st("kind-aria")}
      value={state.kind}
      onSelect={(kind, focus) => actions.setKind(kind as StoreKind, focus)}
      tabs={[
        { value: "all", label: st("filter-all"), count: scoped.length },
        ...STORE_KINDS.map((kind) => ({
          value: kind,
          label: kindsLabel(kind),
          count: scoped.filter((item) => item.type === kind).length,
        })),
      ]}
    />
  );
};
