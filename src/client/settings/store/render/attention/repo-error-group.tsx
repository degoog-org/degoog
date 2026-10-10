import { Button } from "../../../../../shared/ui/components/primitives/button";
import { AttentionLabel } from "./attention-label";
import { AttentionRow } from "./attention-row";
import { BusyLabel } from "../busy-label";
import { repoKey } from "../../model";
import { ago, st } from "../../format";
import type { RepoInfo, StoreActions, StoreState } from "../../../../types/store-tab";

export const RepoErrorGroup = ({
  repo,
  state,
  actions,
}: {
  repo: RepoInfo;
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const busy = state.repoBusy.has(repoKey(repo.url));
  return (
    <div class="settings-group">
      <AttentionRow
        label={
          <AttentionLabel
            icon="fa-circle-exclamation"
            danger
            text={st("repo-failed", { name: repo.name })}
          />
        }
        desc={
          <>
            <code class="store-code">{repo.error ?? ""}</code>
            <br />
            {`${st("repo-failed-desc", { ago: ago(repo.lastFetched) })} `}
            <button
              type="button"
              class="settings-linkish"
              onClick={() => actions.manageRepo(repo.url)}
            >
              {st("manage")}
            </button>
          </>
        }
        control={
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => actions.refreshRepo(repo.url)}
          >
            {busy ? <BusyLabel label={st("retrying")} /> : st("retry")}
          </Button>
        }
      />
    </div>
  );
};
