import { RepoAvatar } from "../repo-avatar";
import { FaIcon } from "../fa-icon";
import { isOfficial, repoBehind, repoItems, repoKey } from "../../model";
import { counted, st } from "../../format";
import type { RepoInfo, StoreActions, StoreState } from "../../../../types/store-tab";

export const REPO_DETAIL_ID = "store-repo-detail";

const _sub = (state: StoreState, repo: RepoInfo): { text: string; cls: string } => {
  if (state.repoBusy.has(repoKey(repo.url))) return { text: st("refreshing"), cls: "" };
  if (repo.error) return { text: st("did-not-refresh"), cls: " store-danger" };
  const behind = repoBehind(state, repo);
  if (behind > 0) return { text: counted("new-commits", behind), cls: " store-warn" };
  const items = repoItems(state, repo);
  const installed = items.filter((i) => i.installed).length;
  return {
    text: installed
      ? `${counted("extensions", items.length)} · ${st("n-installed", { count: installed.toLocaleString() })}`
      : counted("extensions", items.length),
    cls: "",
  };
};

export const RepoTile = ({
  repo,
  state,
  actions,
}: {
  repo: RepoInfo;
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const open = state.expanded === repoKey(repo.url);
  const sub = _sub(state, repo);
  return (
    <div class={open ? "store-repo store-repo--open" : "store-repo"} data-repo={repoKey(repo.url)}>
      <button
        type="button"
        class="store-repo-main"
        aria-expanded={String(open)}
        aria-controls={REPO_DETAIL_ID}
        onClick={() => actions.toggleRepo(repo.url)}
      >
        <RepoAvatar repo={repo} />
        <span class="store-repo-text">
          <span class="store-repo-name">
            <span class="store-repo-name-text">{repo.name}</span>
            {isOfficial(repo) ? <span class="store-quiet">{st("official")}</span> : null}
          </span>
          <span class={`store-repo-sub${sub.cls}`}>{sub.text}</span>
        </span>
        <FaIcon name="fa-chevron-down" class="store-repo-chevron" />
      </button>
    </div>
  );
};
