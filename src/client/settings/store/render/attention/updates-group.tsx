import { Button } from "../../../../../shared/ui/components/primitives/button";
import { AttentionRow } from "./attention-row";
import { UpdateRow } from "./update-row";
import { BusyLabel } from "../busy-label";
import { FaIcon } from "../fa-icon";
import { hasUpdate, itemId, sortByName } from "../../model";
import { counted, listNames, st } from "../../format";
import type { StoreActions, StoreState } from "../../../../types/store-tab";

const UPDATES_PREVIEW = 6;
const LIST_ID = "store-updates-list";

export const UpdatesGroup = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const updates = state.items.filter(hasUpdate).sort(sortByName);
  const open = state.updatesOpen;
  const shown = state.updatesShowAll ? updates : updates.slice(0, UPDATES_PREVIEW);
  return (
    <div class="settings-group">
      <AttentionRow
        label={
          <button
            type="button"
            class="settings-row-label store-att-toggle"
            aria-expanded={String(open)}
            aria-controls={LIST_ID}
            onClick={actions.toggleUpdates}
          >
            {updates.length ? counted("updates", updates.length) : st("updating")}
            <FaIcon
              name="fa-chevron-down"
              class={open ? "store-att-chevron store-att-chevron--open" : "store-att-chevron"}
            />
          </button>
        }
        desc={listNames(updates.map((u) => u.name))}
        control={
          <Button
            variant="primary"
            disabled={state.updatingAll}
            onClick={actions.updateAll}
          >
            {state.updatingAll ? <BusyLabel label={st("busy-updating")} /> : st("update-all")}
          </Button>
        }
      />
      {open && updates.length ? (
        <div class="store-urows" id={LIST_ID}>
          {shown.map((item) => (
            <UpdateRow key={itemId(item)} item={item} state={state} actions={actions} />
          ))}
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
