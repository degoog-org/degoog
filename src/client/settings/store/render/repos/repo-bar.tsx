import { Button } from "../../../../../shared/ui/components/primitives/button";
import { BusyLabel } from "../busy-label";
import { repoBehind } from "../../model";
import { counted, st } from "../../format";
import type { StoreActions, StoreState } from "../../../../types/store-tab";

export const RepoBar = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const failing = state.repos.filter((r) => r.error).length;
  const behind = state.repos.filter((r) => repoBehind(state, r) > 0).length;
  return (
    <div class="store-repo-bar">
      <span class="store-repo-summary">
        <span class="store-repo-summary-part">{counted("repositories", state.repos.length)}</span>
        {failing ? (
          <>
            {" "}
            <span class="store-repo-summary-part">
              {"· "}
              <span class="store-danger">{st("n-did-not-refresh", { count: String(failing) })}</span>
            </span>
          </>
        ) : null}
        {behind ? (
          <>
            {" "}
            <span class="store-repo-summary-part">
              {"· "}
              <span class="store-warn">{st("n-behind", { count: String(behind) })}</span>
            </span>
          </>
        ) : null}
      </span>
      <Button
        variant="secondary"
        class="degoog-btn--sm"
        disabled={state.refreshingAll}
        onClick={actions.refreshAll}
      >
        {state.refreshingAll ? <BusyLabel label={st("refreshing")} /> : st("refresh-all")}
      </Button>
    </div>
  );
};
