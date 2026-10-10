import { BehindGroup } from "./behind-group";
import { RepoErrorGroup } from "./repo-error-group";
import { RestartGroup } from "./restart-group";
import { UpdatesGroup } from "./updates-group";
import { parseReason } from "../../../shared/restart-state";
import { hasUpdate, repoBehind, repoKey } from "../../model";
import { st } from "../../format";
import type { StoreActions, StoreState } from "../../../../types/store-tab";

export const AttentionPanel = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element | null => {
  const showUpdates = state.updatingAll || state.items.some(hasUpdate);
  const restartNames = state.restartReasons.map(
    (reason) => parseReason(reason)?.name ?? reason,
  );
  const errored = state.repos.filter((r) => r.error);
  const behind = state.repos.filter((r) => repoBehind(state, r) > 0);
  if (!showUpdates && !restartNames.length && !errored.length && !behind.length)
    return null;
  return (
    <section
      class="settings-section ext-card degoog-panel degoog-panel--ext-card store-attention"
      aria-label={st("attention-aria")}
    >
      {showUpdates ? <UpdatesGroup state={state} actions={actions} /> : null}
      {restartNames.length ? (
        <RestartGroup names={restartNames} restarting={state.restarting} actions={actions} />
      ) : null}
      {errored.map((repo) => (
        <RepoErrorGroup key={repoKey(repo.url)} repo={repo} state={state} actions={actions} />
      ))}
      {behind.length ? <BehindGroup repos={behind} state={state} actions={actions} /> : null}
    </section>
  );
};
