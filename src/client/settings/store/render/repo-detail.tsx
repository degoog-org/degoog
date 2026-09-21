import { Button } from "../../../../shared/ui/components/primitives/button";
import { RepoImage } from "./repo-image";
import { formatRelativeTime, normalizeRepoUrl, OFFICIAL_REPO_URL, repoImageSrc } from "./repo-url";
import type { RepoInfo } from "../../../types/store-tab";

export interface RepoDetailProps {
  repo: RepoInfo;
  statusByUrl: Record<string, number>;
}

export const RepoDetail = ({ repo, statusByUrl }: RepoDetailProps): JSX.Element => {
  const isOfficial =
    normalizeRepoUrl(repo.url) === normalizeRepoUrl(OFFICIAL_REPO_URL);
  const normUrl = normalizeRepoUrl(repo.url);
  const behind = statusByUrl[normUrl] ?? statusByUrl[repo.url] ?? 0;
  return (
    <div class="store-repo-detail" data-url={repo.url}>
      <div class="store-repo-detail-media">
        <RepoImage src={repoImageSrc(repo)} />
      </div>
      <div class="store-repo-detail-body">
        <div class="store-repo-name">{repo.name || repo.url}</div>
        <a
          href={repo.url.replace(/\.git$/, "")}
          target="_blank"
          rel="noopener"
          class="store-repo-url"
        >
          {repo.url}
        </a>
        <div class="store-repo-meta">
          {formatRelativeTime(repo.lastFetched)}
          {repo.error ? <span class="store-repo-error">{repo.error}</span> : null}
          {behind > 0 ? (
            <span class="store-repo-updates-note" title="Refresh to get latest">
              {`${behind} update${behind !== 1 ? "s" : ""} available`}
            </span>
          ) : null}
        </div>
        <div class="store-repo-actions">
          <button class="btn degoog-btn store-btn-refresh" type="button" data-url={repo.url}>
            Refresh
          </button>
          {isOfficial ? null : (
            <Button variant="danger" class="store-btn-remove" data-url={repo.url}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
