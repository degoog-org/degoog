import { RepoDetail } from "./repo-detail";
import { RepoTile } from "./repo-tile";
import { findRepo, repoKey } from "../../model";
import type { StoreActions, StoreState } from "../../../../types/store-tab";

export const REPO_GRID_ID = "store-repo-grid";

const _detailAfter = (state: StoreState): number => {
  const index = state.repos.findIndex((r) => repoKey(r.url) === state.expanded);
  if (index < 0) return -1;
  const cols = Math.max(1, state.repoCols);
  return Math.min(state.repos.length - 1, (Math.floor(index / cols) + 1) * cols - 1);
};

export const RepoGrid = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const expanded = findRepo(state, state.expanded);
  const after = expanded ? _detailAfter(state) : -1;
  return (
    <div class="store-repo-grid" id={REPO_GRID_ID}>
      {state.repos.map((repo, index) => (
        <>
          <RepoTile key={repoKey(repo.url)} repo={repo} state={state} actions={actions} />
          {expanded && index === after ? (
            <RepoDetail key="detail" repo={expanded} state={state} actions={actions} />
          ) : null}
        </>
      ))}
    </div>
  );
};
