import { Button } from "../../../../../shared/ui/components/primitives/button";
import { UpdateRow } from "./update-row";
import { BusyLabel } from "../busy-label";
import { FaIcon } from "../fa-icon";
import { Spinner } from "../spinner";
import { hasUpdate, itemId, sortByName } from "../../model";
import { counted, st } from "../../format";
import type { StoreActions, StoreState } from "../../../../types/store-tab";

const UPDATES_PREVIEW = 6;
const LIST_ID = "store-updates-list";
export const UPDATES_MENU_CLASS = "store-updates";

export const UpdatesMenu = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element | null => {
  const updates = state.items.filter(hasUpdate).sort(sortByName);
  if (!updates.length && !state.updatingAll) return null;
  const open = state.updatesOpen;
  const shown = state.updatesShowAll ? updates : updates.slice(0, UPDATES_PREVIEW);
  const label = updates.length ? counted("updates", updates.length) : st("updating");
  return (
    <div class={UPDATES_MENU_CLASS}>
      <button
        type="button"
        class="store-updates-toggle"
        aria-expanded={String(open)}
        aria-controls={LIST_ID}
        aria-label={label}
        onClick={actions.toggleUpdates}
      >
        <span class="store-updates-icon" aria-hidden="true">
          {state.updatingAll ? <Spinner /> : <FaIcon name="fa-arrow-up" />}
        </span>
        {updates.length ? (
          <span class="store-updates-n">{updates.length.toLocaleString()}</span>
        ) : null}
        <span class="store-updates-label">{label}</span>
        <FaIcon
          name="fa-chevron-down"
          class={open ? "store-updates-chevron store-updates-chevron--open" : "store-updates-chevron"}
        />
      </button>
      {open ? (
        <div class="degoog-dropdown store-updates-pop" id={LIST_ID} role="group" aria-label={label}>
          <div class="store-updates-head">
            <span class="store-updates-title">{label}</span>
            <Button
              variant="primary"
              class="degoog-btn--sm"
              disabled={state.updatingAll}
              onClick={actions.updateAll}
            >
              {state.updatingAll ? <BusyLabel label={st("busy-updating")} /> : st("update-all")}
            </Button>
          </div>
          <div class="store-updates-list">
            {shown.map((item) => (
              <UpdateRow key={itemId(item)} item={item} state={state} actions={actions} />
            ))}
          </div>
          {updates.length > shown.length ? (
            <button type="button" class="store-show-all" onClick={actions.showAllUpdates}>
              {st("show-all", { count: String(updates.length) })}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
