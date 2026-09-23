import { TransText } from "../../../shared/ui/components/primitives/trans-text";
import { StoreLinkButton } from "../shared/store-link-button";

const t = window.scopedT("core");

export const EmptyState = (): JSX.Element => (
  <div class="ext-group">
    <p class="degoog-text degoog-text--sm degoog-text--secondary">
      <TransText
        text={t("settings-page.extensions.no-autocomplete", {
          store: "{store}",
        })}
        slots={{
          store: (
            <StoreLinkButton
              label={t("settings-page.extensions.no-autocomplete-store")}
            />
          ),
        }}
      />
    </p>
  </div>
);
