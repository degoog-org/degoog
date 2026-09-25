import type { RepoInfo } from "../../../types/store-tab";

export const RepoErrors = ({ repos }: { repos: RepoInfo[] }): JSX.Element => (
  <>
    {repos.map((repo, index) => (
      <>
        {index > 0 ? <br /> : null}
        {`${repo.name || repo.url}: ${repo.error ?? ""}`}
      </>
    ))}
  </>
);
