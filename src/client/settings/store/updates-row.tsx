import type { StoreItem } from "../../types/store-tab";

export const UpdatesRow = ({
  item,
  onUpdate,
}: {
  item: StoreItem;
  onUpdate: (button: HTMLButtonElement) => void;
}): JSX.Element => (
  <div
    class="store-updates-row"
    data-repo-url={item.repoUrl}
    data-item-path={item.path}
    data-type={item.type}
  >
    <div class="store-updates-row-info">
      <span class="store-updates-row-name">{item.name}</span>
      <span class="store-updates-row-meta">
        {item.repoName}
        {" · "}
        <span class="store-card-version-old">{`v${item.installedVersion || "?"}`}</span>
        {` \u2192 v${item.version}`}
      </span>
    </div>
    <button
      class="btn btn--primary degoog-btn degoog-btn--primary store-btn-update"
      type="button"
      data-repo-url={item.repoUrl}
      data-item-path={item.path}
      data-type={item.type}
      aria-label="Update"
      onClick={(event) => onUpdate(event.currentTarget as HTMLButtonElement)}
    >
      <i class="fa-solid fa-download"></i>
    </button>
  </div>
);
