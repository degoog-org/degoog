import { RepoOption } from "./repo-option";
import { findRepo, repoKey, scopeItems } from "../../model";
import { st } from "../../format";
import type { StoreActions, StoreState } from "../../../../types/store-tab";

export const REPO_FILTER_CLASS = "store-repo-filter";
export const REPO_FILTER_BUTTON_ID = "store-repo-btn";
export const REPO_FILTER_QUERY_ID = "store-repo-q";
const POP_ID = "store-repo-pop";

const _label = (state: StoreState): string => {
  if (!state.repoSel.length) return st("all-repos");
  if (state.repoSel.length === 1)
    return findRepo(state, state.repoSel[0])?.name ?? st("n-repos", { count: "1" });
  return st("n-repos", { count: String(state.repoSel.length) });
};

const _Options = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const scope = scopeItems(state);
  const q = state.repoPopQ.trim().toLowerCase();
  const list = state.repos.filter((repo) => {
    const key = repoKey(repo.url);
    if (q && !repo.name.toLowerCase().includes(q) && !repo.url.toLowerCase().includes(q))
      return false;
    return (
      state.view !== "installed" ||
      state.repoSel.includes(key) ||
      scope.some((i) => repoKey(i.repoUrl) === key)
    );
  });
  if (!list.length)
    return <p class="store-repo-pop-empty">{st("repo-no-match", { q: state.repoPopQ.trim() })}</p>;
  return (
    <>
      {list.map((repo) => {
        const key = repoKey(repo.url);
        return (
          <RepoOption
            key={key}
            repo={repo}
            count={scope.filter((i) => repoKey(i.repoUrl) === key).length}
            checked={state.repoSel.includes(key)}
            onToggle={(on) => actions.toggleRepoSel(key, on)}
          />
        );
      })}
    </>
  );
};

export const RepoFilter = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => {
  const label = _label(state);
  const selected = state.repoSel.length;
  return (
    <span
      class={`degoog-select-wrap filter-select ${REPO_FILTER_CLASS}${selected ? " filter-select--set" : ""}`}
    >
      <button
        type="button"
        class="store-repo-filter-btn"
        id={REPO_FILTER_BUTTON_ID}
        aria-haspopup="true"
        aria-expanded={String(state.repoPopOpen)}
        aria-controls={POP_ID}
        aria-label={st("repos-aria", { label })}
        onClick={actions.toggleRepoPop}
      >
        {label}
      </button>
      <div
        class="degoog-dropdown store-repo-pop"
        id={POP_ID}
        role="group"
        aria-label={st("repo-pop-aria")}
        hidden={!state.repoPopOpen}
      >
        <div class="store-repo-pop-head">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input
            type="text"
            class="degoog-input"
            id={REPO_FILTER_QUERY_ID}
            placeholder={st("find-repo")}
            autocomplete="off"
            spellcheck="false"
            aria-label={st("find-repo")}
            value={state.repoPopQ}
            onInput={(event) =>
              actions.setRepoPopQuery((event.currentTarget as HTMLInputElement).value)
            }
          />
        </div>
        <div class="store-repo-pop-list">
          <_Options state={state} actions={actions} />
        </div>
        <div class="store-repo-pop-foot">
          <span>{selected ? st("n-selected", { count: String(selected) }) : st("every-repo")}</span>
          {selected ? (
            <button type="button" class="settings-linkish" onClick={actions.clearRepoSel}>
              {st("clear")}
            </button>
          ) : null}
        </div>
      </div>
    </span>
  );
};
