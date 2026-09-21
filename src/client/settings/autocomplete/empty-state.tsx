import { raw } from "../../../shared/ui/core/raw";

const t = window.scopedT("core");

const renderStoreButton = (): string =>
  `<button class="degoog-link-btn" type="button" data-switch-tab="store">${t(
    "settings-page.extensions.no-autocomplete-store",
  )}</button>`;

export const EmptyState = (): JSX.Element => {
  const storeBtn = renderStoreButton();
  return (
    <div class="ext-group">
      <p class="degoog-text degoog-text--sm degoog-text--secondary">
        {raw(t("settings-page.extensions.no-autocomplete", { store: storeBtn }))}
      </p>
    </div>
  );
};
