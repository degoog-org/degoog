import { Button } from "../../../../shared/ui/components/primitives/button";

const REPO_DESC_BEFORE =
  "Add a git repository URL to browse and install plugins, themes, engines, and transports. Set ";
const REPO_DESC_AFTER = " in the repo’s package.json to show an image next to the URL.";

export const ReposSection = (): JSX.Element => (
  <section class="store-repos-section settings-section ext-card degoog-panel degoog-panel--ext-card">
    <div class="store-repos-header">
      <h2 class="settings-section-heading">Repositories</h2>
      <div class="header-actions">
        <div class="store-repos-actions">
          <Button variant="secondary" class="store-btn-refresh-all">
            Refresh all
          </Button>
        </div>
        <Button variant="primary" class="store-btn-add">
          Add repository
        </Button>
      </div>
    </div>
    <div class="store-add-repo-wrap" style="display:none">
      <input
        type="text"
        class="store-search-input degoog-search-bar degoog-search-bar--square-advanced store-input-url"
        placeholder="https://github.com/user/repo.git"
      />
      <Button variant="primary" class="store-btn-add-confirm" aria-label="Add repository">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
      </Button>
      <span class="store-inline-error"></span>
    </div>
    <p class="settings-desc">
      {REPO_DESC_BEFORE}
      <code>repo-image</code>
      {REPO_DESC_AFTER}
    </p>
    <div class="store-repo-list-wrap"></div>
    <div class="store-repo-errors" style="display:none"></div>
  </section>
);
