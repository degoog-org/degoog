import { ItemCard } from "../card/item-card";
import { itemId } from "../../model";
import { kindsLabel } from "../labels";
import { st } from "../../format";
import type { StoreActions, StoreItem, StoreItemType, StoreState } from "../../../../types/store-tab";

const PREVIEW = 6;

export const KindGroup = ({
  kind,
  items,
  preview,
  state,
  actions,
}: {
  kind: StoreItemType;
  items: StoreItem[];
  preview: boolean;
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const shown = preview ? items.slice(0, PREVIEW) : items;
  const installed = items.filter((i) => i.installed).length;
  const label = kindsLabel(kind);
  return (
    <section class="store-group" aria-label={label}>
      <div class="store-group-head">
        <h3 class="store-group-title">{label}</h3>
        <span class="store-group-count">
          {installed && state.view !== "installed"
            ? `${items.length.toLocaleString()} · ${st("n-installed", { count: installed.toLocaleString() })}`
            : items.length.toLocaleString()}
        </span>
        {items.length > shown.length ? (
          <button
            type="button"
            class="store-show-all store-group-more"
            onClick={() => actions.showKind(kind)}
          >
            {st("show-all", { count: items.length.toLocaleString() })}
          </button>
        ) : null}
      </div>
      <div class={kind === "theme" ? "store-grid store-grid--theme" : "store-grid"}>
        {shown.map((item) => (
          <ItemCard key={itemId(item)} item={item} state={state} actions={actions} />
        ))}
      </div>
    </section>
  );
};
