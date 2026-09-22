import { render } from "../../../shared/ui/tribute/dom";
import { ExtGroup } from "../../../shared/ui/components/extensions/ext-group";
import { AutocompleteCard } from "./autocomplete-card";
import { EmptyState } from "./empty-state";
import type { AllExtensions } from "../../types";

const t = window.scopedT("core");

const _switchTab = (tab: string): void => {
  document.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.click();
};

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
