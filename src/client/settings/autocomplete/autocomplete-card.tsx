import { ExtCard } from "../../../shared/ui/components/extensions/ext-card";
import { ExtCardName } from "../../../shared/ui/components/extensions/ext-card-name";
import { ExtToggle } from "../../../shared/ui/components/extensions/ext-toggle";
import {
  extCardBadgeNode,
  extCardConfigureNode,
  extCardRestartWarningNode,
  extCardVersionWarningNode,
} from "../shared/ext-card";
import { extToggleHandler } from "../shared/ext-toggle";
import { openModal } from "../../modules/modals/settings-modal/modal";
import type { ExtensionMeta } from "../../types";

export const AutocompleteCard = ({ provider }: { provider: ExtensionMeta }): JSX.Element => {
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
