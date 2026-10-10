import { Button } from "../../../../../shared/ui/components/primitives/button";
import { FaIcon } from "../fa-icon";
import { hasUpdate, itemId } from "../../model";
import { st } from "../../format";
import type { StoreActions, StoreItem, StoreState } from "../../../../types/store-tab";

export const CardActions = ({
  item,
  state,
  actions,
}: {
  item: StoreItem;
  state: StoreState;
  actions: StoreActions;
}): JSX.Element | null => {
  if (state.busy.has(itemId(item))) return null;
  const disabled = state.updatingAll;
  if (item.orphaned)
    return (
      <Button
        variant="danger"
        class="degoog-btn--sm"
        disabled={disabled}
        onClick={() => actions.deleteOrphan(item)}
      >
        {st("delete")}
      </Button>
    );
  if (!item.installed)
    return (
      <Button
        variant="secondary"
        class="degoog-btn--sm"
        disabled={disabled}
        onClick={() => actions.install(item)}
      >
        {st("install")}
      </Button>
    );
  const trash = (
    <button
      type="button"
      class="store-icon-btn store-icon-btn--danger store-btn-uninstall"
      data-tooltip={st("uninstall")}
      aria-label={st("uninstall-aria", { name: item.name })}
      disabled={disabled}
      onClick={() => actions.uninstall(item)}
    >
      <FaIcon name="fa-trash-can" />
    </button>
  );
  if (!hasUpdate(item)) return trash;
  return (
    <>
      <Button
        variant="primary"
        class="degoog-btn--sm"
        disabled={disabled}
        onClick={() => actions.update(item)}
      >
        {st("update")}
      </Button>
      {trash}
    </>
  );
};
