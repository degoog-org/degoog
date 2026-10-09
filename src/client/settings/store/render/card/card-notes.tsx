import pkg from "../../../../../../package.json";
import { itemId } from "../../model";
import { kindsLabel } from "../labels";
import { st } from "../../format";
import type { StoreItem, StoreState } from "../../../../types/store-tab";

export const CardNotes = ({
  item,
  state,
}: {
  item: StoreItem;
  state: StoreState;
}): JSX.Element => {
  const fail = state.failed.get(itemId(item));
  return (
    <>
      {fail ? <p class="store-note store-danger">{fail.message}</p> : null}
      {item.requiresNewerVersion ? (
        <p class="store-note store-warn">
          {st("needs-newer", {
            min: item.minDegoogVersion ?? "?",
            current: pkg.version,
          })}
        </p>
      ) : null}
      {item.untracked ? (
        <p class="store-note store-warn">
          {st("untracked-note", { kind: kindsLabel(item.type).toLowerCase() })}
        </p>
      ) : item.orphaned ? (
        <p class="store-note store-warn">{st("orphaned-note")}</p>
      ) : null}
    </>
  );
};
