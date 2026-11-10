import { RawDogIt } from "../../../../../shared/ui/tribute/rawdogit";
import { renderMdInline } from "../../../../utils/dom/md";
import { itemId } from "../../model";
import { st } from "../../format";
import type { StoreActions, StoreItem, StoreState } from "../../../../types/store-tab";

const DESC_ATTR = "data-desc";

export const syncClampedDescs = (root: ParentNode, state: StoreState): boolean => {
  let changed = false;
  for (const el of root.querySelectorAll<HTMLElement>(`[${DESC_ATTR}]`)) {
    const id = el.getAttribute(DESC_ATTR) ?? "";
    if (state.descOpen.has(id)) continue;
    const clamped = el.scrollHeight > el.clientHeight;
    if (clamped === state.descClamped.has(id)) continue;
    if (clamped) state.descClamped.add(id);
    else state.descClamped.delete(id);
    changed = true;
  }
  return changed;
};

export const CardDesc = ({
  item,
  state,
  actions,
}: {
  item: StoreItem;
  state: StoreState;
  actions: StoreActions;
}): JSX.Element | null => {
  if (!item.description) return null;
  const id = itemId(item);
  const open = state.descOpen.has(id);
  return (
    <>
      <p
        class={open ? "store-card-desc store-card-desc--open" : "store-card-desc"}
        title={item.description}
        data-desc={id}
      >
        <RawDogIt html={renderMdInline(item.description)} />
      </p>
      {open || state.descClamped.has(id) ? (
        <button
          type="button"
          class="store-show-all store-desc-toggle"
          aria-expanded={String(open)}
          onClick={() => actions.toggleDesc(item)}
        >
          {st(open ? "show-less" : "show-more")}
        </button>
      ) : null}
    </>
  );
};
