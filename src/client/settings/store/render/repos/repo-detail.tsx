import { Button } from "../../../../../shared/ui/components/primitives/button";
import { FaIcon } from "../fa-icon";
import { REPO_DETAIL_ID } from "./repo-tile";
import { isOfficial, repoBehind, repoItems, repoKey } from "../../model";
import { ago, counted, st } from "../../format";
import type { RepoInfo, StoreActions, StoreState } from "../../../../types/store-tab";

const _Note = ({
  repo,
  state,
  actions,
}: {
  repo: RepoInfo;
  state: StoreState;
  actions: StoreActions;
}): JSX.Element | null => {
  const note = state.repoNotes.get(repoKey(repo.url));
  if (!note) return null;
  return (
    <p class={note.ok ? "store-repo-line store-ok" : "store-repo-line store-danger"}>
      {note.text}
      {note.showInstalled ? (
        <>
          {" "}
          <button
            type="button"
            class="settings-linkish"
            onClick={() => actions.showRepoInstalled(repo.url)}
          >
            {st("show-them")}
          </button>
        </>
      ) : null}
    </p>
  );
};

export const RepoDetail = ({
  repo,
  state,
  actions,
}: {
  repo: RepoInfo;
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const items = repoItems(state, repo);
  const installed = items.filter((i) => i.installed).length;
  const busy = state.repoBusy.has(repoKey(repo.url));
  const behind = repoBehind(state, repo);
  const official = isOfficial(repo);
  return (
    <div
      class="store-repo-detail"
      id={REPO_DETAIL_ID}
      role="region"
      aria-label={st("repo-details-aria", { name: repo.name })}
    >
      <div class="store-repo-detail-text">
        <span class="store-repo-detail-name">
          {repo.name}
          {official ? <span class="store-quiet">{st("official")}</span> : null}
        </span>
        <a
          class="store-repo-url"
          href={repo.url.replace(/\.git$/, "")}
          target="_blank"
          rel="noopener"
        >
          {repo.url.replace(/^https?:\/\//, "").replace(/\.git$/, "")}
        </a>
        <p class="store-repo-line">
          {[
            counted("extensions", items.length),
            installed ? st("n-installed", { count: installed.toLocaleString() }) : "",
            busy ? st("refreshing-lower") : st("fetched-ago", { ago: ago(repo.lastFetched) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {repo.error ? (
          <p class="store-repo-line store-danger">
            {`${st("last-refresh-failed")} `}
            <code class="store-code">{repo.error}</code>
            {`. ${st("showing-last-fetch")}`}
          </p>
        ) : behind > 0 ? (
          <p class="store-repo-line store-warn">{counted("upstream-commits", behind)}</p>
        ) : null}
        <_Note repo={repo} state={state} actions={actions} />
      </div>
      <div class="store-repo-detail-actions">
        <Button
          variant="secondary"
          class="degoog-btn--sm"
          onClick={() => actions.browseRepo(repo.url)}
        >
          {counted("browse-extensions", items.length)}
        </Button>
        <button
          type="button"
          class="store-icon-btn"
          data-tooltip={repo.error ? st("retry") : st("refresh")}
          aria-label={st("refresh-aria", { name: repo.name })}
          disabled={busy || state.refreshingAll}
          onClick={() => actions.refreshRepo(repo.url)}
        >
          {busy ? (
            <FaIcon name="fa-circle-notch" class="fa-spin" />
          ) : (
            <FaIcon name="fa-rotate-right" />
          )}
        </button>
        {official ? null : (
          <button
            type="button"
            class="store-icon-btn store-icon-btn--danger"
            data-tooltip={st("remove")}
            aria-label={st("remove-aria", { name: repo.name })}
            disabled={busy}
            onClick={() => actions.removeRepo(repo.url)}
          >
            <FaIcon name="fa-trash-can" />
          </button>
        )}
      </div>
    </div>
  );
};
