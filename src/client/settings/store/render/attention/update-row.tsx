import { Button } from "../../../../../shared/ui/components/primitives/button";
import { BusyLabel } from "../busy-label";
import { VersionChange } from "../version-change";
import { itemSubLabel, kindLabel } from "../labels";
import { itemId } from "../../model";
import { st } from "../../format";
import type { StoreActions, StoreItem, StoreState } from "../../../../types/store-tab";

export const UpdateRow = ({
  item,
  state,
  actions,
}: {
  item: StoreItem;
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const id = itemId(item);
  const busy = state.busy.get(id);
  const fail = state.failed.get(id);
  return (
    <div class="store-urow">
      <div class="store-urow-text">
        <span class="store-urow-name">{item.name}</span>
        <span class={fail ? "store-urow-meta store-danger" : "store-urow-meta"}>
          {fail
            ? st("update-failed-message", { message: fail.message })
            : [kindLabel(item.type), itemSubLabel(item), item.repoName]
                .filter(Boolean)
                .join(" · ")}
        </span>
      </div>
      <VersionChange from={item.installedVersion ?? "?"} to={item.version} />
      <Button
        variant="secondary"
        class="degoog-btn--sm"
        disabled={!!busy || state.updatingAll}
        onClick={() => actions.update(item)}
      >
        {busy ? <BusyLabel label={st(`busy-${busy}`)} /> : st("update")}
      </Button>
    </div>
  );
};
