import { Button } from "../../../../../shared/ui/components/primitives/button";
import { AttentionRow } from "./attention-row";
import { BusyLabel } from "../busy-label";
import { repoBehind, repoKey } from "../../model";
import { counted, listNames, st } from "../../format";
import type { RepoInfo, StoreActions, StoreState } from "../../../../types/store-tab";

export const BehindGroup = ({
  repos,
  state,
  actions,
}: {
  repos: RepoInfo[];
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const busy = repos.some((r) => state.repoBusy.has(repoKey(r.url)));
  const one = repos[0];
  const title =
    repos.length === 1
      ? counted("behind-title", repoBehind(state, one), { name: one.name })
      : st("behind-repos", { count: String(repos.length) });
  const desc =
    repos.length === 1
      ? st("behind-desc-one")
      : st("behind-desc-many", {
          names: listNames(repos.map((r) => `${r.name} (${repoBehind(state, r)})`)),
        });
  return (
    <div class="settings-group">
      <AttentionRow
        label={<span class="settings-row-label">{title}</span>}
        desc={desc}
        control={
          <Button variant="secondary" disabled={busy} onClick={actions.refreshBehind}>
            {busy ? <BusyLabel label={st("refreshing")} /> : st("refresh")}
          </Button>
        }
      />
    </div>
  );
};
