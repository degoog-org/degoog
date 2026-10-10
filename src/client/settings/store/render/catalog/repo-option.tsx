import { RepoAvatar } from "../repo-avatar";
import type { RepoInfo } from "../../../../types/store-tab";

export const RepoOption = ({
  repo,
  count,
  checked,
  onToggle,
}: {
  repo: RepoInfo;
  count: number;
  checked: boolean;
  onToggle: (on: boolean) => void;
}): JSX.Element => (
  <label class="degoog-checkbox-wrap store-repo-opt">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onToggle((event.currentTarget as HTMLInputElement).checked)}
    />
    <span class="degoog-checkbox">
      <i class="fa-solid fa-check"></i>
    </span>
    <RepoAvatar repo={repo} />
    <span class="store-repo-opt-name">{repo.name}</span>
    <span class="store-repo-opt-n">{count.toLocaleString()}</span>
  </label>
);
