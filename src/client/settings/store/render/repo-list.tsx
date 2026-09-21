import { renderHtml } from "../../../../shared/ui/core/html";
import { RepoDetail } from "./repo-detail";
import { RepoImage } from "./repo-image";
import { normalizeRepoUrl, repoImageSrc } from "./repo-url";
import type { RepoInfo } from "../../../types/store-tab";

export interface RepoListProps {
  repos: RepoInfo[];
  statusByUrl: Record<string, number>;
  selectedUrl: string | null;
}

export const RepoList = ({ repos, statusByUrl, selectedUrl }: RepoListProps): JSX.Element => {
  if (!repos.length) {
    return (
      <p class="store-empty">
        No repositories added. Add a git repository URL to browse its plugins, themes, engines,
        transports and shortcuts.
      </p>
    );
  }
  const selected = selectedUrl ? repos.find((r) => r.url === selectedUrl) : null;
  return (
    <>
      <div class="store-repo-list">
        {repos.map((repo) => {
          const behind =
            statusByUrl[normalizeRepoUrl(repo.url)] ?? statusByUrl[repo.url] ?? 0;
          return (
            <div
              key={repo.url}
              class={
                repo.url === selectedUrl
                  ? "store-repo-item store-repo-item--active"
                  : "store-repo-item"
              }
              data-url={repo.url}
              role="button"
              tabindex="0"
              title={repo.name || repo.url}
            >
              <div class="store-repo-item-media">
                <RepoImage src={repoImageSrc(repo)} alt={repo.name || ""} />
                {behind > 0 ? <span class="store-repo-update-dot"></span> : null}
              </div>
            </div>
          );
        })}
      </div>
      {selected ? <RepoDetail repo={selected} statusByUrl={statusByUrl} /> : null}
    </>
  );
};

export function renderRepoList(
  repos: RepoInfo[],
  statusByUrl: Record<string, number>,
  selectedUrl: string | null,
): string {
  return renderHtml(
    <RepoList repos={repos} statusByUrl={statusByUrl} selectedUrl={selectedUrl} />,
  );
}
