import { BusyLabel } from "../busy-label";
import { FaIcon } from "../fa-icon";
import { VersionChange } from "../version-change";
import { hasUpdate, itemId, restartPending } from "../../model";
import { st } from "../../format";
import type { StoreItem, StoreState } from "../../../../types/store-tab";

const _Installed = ({ extra }: { extra: JSX.Element | null }): JSX.Element => (
  <span class="store-state">
    <FaIcon name="fa-check" class="store-ok" />
    <span class="store-state-strong">{st("installed")}</span>
    {extra}
  </span>
);

export const CardState = ({
  item,
  state,
}: {
  item: StoreItem;
  state: StoreState;
}): JSX.Element => {
  const id = itemId(item);
  const busy = state.busy.get(id);
  if (busy)
    return (
      <span class="store-state store-state-strong">
        <BusyLabel label={st(`busy-${busy}`)} />
      </span>
    );
  const fail = state.failed.get(id);
  if (fail)
    return <span class="store-state store-danger">{st(`${fail.verb}-failed`)}</span>;
  const version = item.installedVersion ? (
    <span>{`· v${item.installedVersion}`}</span>
  ) : null;
  if (item.orphaned) return <_Installed extra={version} />;
  if (hasUpdate(item))
    return (
      <VersionChange
        class="store-state store-ver"
        from={item.installedVersion ?? "?"}
        to={item.version}
      />
    );
  if (item.installed)
    return (
      <_Installed
        extra={
          restartPending(state, item) ? (
            <span class="store-warn">{`· ${st("loads-after-restart")}`}</span>
          ) : (
            version
          )
        }
      />
    );
  return <span class="store-state">{`v${item.version}`}</span>;
};
