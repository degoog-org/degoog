import { BehindGroup } from "./behind-group";
import { RepoErrorGroup } from "./repo-error-group";
import { RestartGroup } from "./restart-group";
import { parseReason } from "../../../shared/restart-state";
import { repoBehind, repoKey } from "../../model";
import { st } from "../../format";
import type { StoreActions, StoreState } from "../../../../types/store-tab";

export const AttentionPanel = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element | null => {
  const restartNames = state.restartReasons.map(
    (reason) => parseReason(reason)?.name ?? reason,
  );
  const errored = state.repos.filter((r) => r.error);
  const behind = state.repos.filter((r) => repoBehind(state, r) > 0);
  if (!restartNames.length && !errored.length && !behind.length) return null;
  return (
    <section
      class="settings-section ext-card degoog-panel degoog-panel--ext-card store-attention"
      aria-label={st("attention-aria")}
    >
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
