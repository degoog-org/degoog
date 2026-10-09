import { RepoAddForm } from "./repo-add-form";
import { RepoBar } from "./repo-bar";
import { RepoGrid } from "./repo-grid";
import { st } from "../../format";
import type { StoreActions, StoreState } from "../../../../types/store-tab";

const REPOS_VIEW_CLASS = "store-repos";

export const ReposView = ({
  state,
  actions,
}: {
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => (
  <section class={`settings-section ext-card degoog-panel degoog-panel--ext-card ${REPOS_VIEW_CLASS}`}>
    <div class="setting-section-heading-wrapper store-panel-head">
      <div class="settings-accordion-title">
        <h2 class="settings-section-heading">{st("repos-heading")}</h2>
        <p class="settings-desc settings-accordion-summary">{st("repos-desc")}</p>
      </div>
      <div class="settings-accordion-icons">
        <div class="floating-section-icon">
          <i class="fa-solid fa-code-branch"></i>
        </div>
      </div>
    </div>
    <div class="store-panel-body">
      <RepoAddForm state={state} actions={actions} />
      <RepoBar state={state} actions={actions} />
      <RepoGrid state={state} actions={actions} />
    </div>
  </section>
);
