import { render } from "../../../shared/ui/core/dom";
import { raw } from "../../../shared/ui/core/raw";
import { ExtCard } from "../../../shared/ui/components/extensions/ext-card";
import { ExtCardName } from "../../../shared/ui/components/extensions/ext-card-name";
import { ExtGroup } from "../../../shared/ui/components/extensions/ext-group";
import { ExtToggle } from "../../../shared/ui/components/extensions/ext-toggle";
import {
  extCardBadgeNode,
  extCardConfigureNode,
  extCardRestartWarningNode,
  extCardVersionWarningNode,
} from "../shared/ext-card";
import { extToggleHandler } from "../shared/ext-toggle";
import { openModal } from "../../modules/modals/settings-modal/modal";
import type { ExtensionMeta, AllExtensions } from "../../types";

const t = window.scopedT("core");

const AutocompleteCard = ({ provider }: { provider: ExtensionMeta }): JSX.Element => {
  const isEnabled = provider.settings["disabled"] !== "true";
  const toggleId = `autocomplete-toggle-${provider.id}`;

  return (
    <ExtCard
      id={provider.id}
      nameRow={[
        extCardRestartWarningNode(provider),
        <ExtCardName
          htmlFor={toggleId}
          class="autocomplete-toggle-label"
          name={provider.displayName}
        />,
      ]}
      info={extCardVersionWarningNode(provider)}
      actions={[
        extCardBadgeNode(provider),
        extCardConfigureNode(provider, () => openModal(provider)),
        <ExtToggle
          id={toggleId}
          inputClass="autocomplete-toggle-input"
          dataId={provider.id}
          checked={isEnabled}
          onChange={extToggleHandler(provider.id, isEnabled, "autocomplete")}
        />,
      ]}
    />
  );
};

const _switchTab = (tab: string): void => {
  document.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.click();
};

const EmptyState = (): JSX.Element => {
  const storeBtn = renderStoreButton();
  return (
    <div class="ext-group">
      <p class="degoog-text degoog-text--sm degoog-text--secondary">
        {raw(t("settings-page.extensions.no-autocomplete", { store: storeBtn }))}
      </p>
    </div>
  );
};

const renderStoreButton = (): string =>
  `<button class="degoog-link-btn" type="button" data-switch-tab="store">${t(
    "settings-page.extensions.no-autocomplete-store",
  )}</button>`;

export function initAutocompleteTab(allExtensions: AllExtensions): void {
  const container = document.getElementById("autocomplete-content");
  if (!container) return;

  const providers = allExtensions.autocomplete ?? [];

  render(
    providers.length > 0 ? (
      <ExtGroup label={t("settings-page.extensions.group-autocomplete")}>
        {providers.map((provider) => (
          <AutocompleteCard key={provider.id} provider={provider} />
        ))}
      </ExtGroup>
    ) : (
      <EmptyState />
    ),
    container,
  );

  container
    .querySelector<HTMLButtonElement>("[data-switch-tab]")
    ?.addEventListener("click", (e) => {
      const tab = (e.currentTarget as HTMLButtonElement).dataset.switchTab;
      if (tab) _switchTab(tab);
    });
}
