import { raw } from "../../../shared/ui/tribute/rawdogit";
import { ExtCard } from "../../../shared/ui/components/extensions/ext-card";
import { ExtCardDesc } from "../../../shared/ui/components/extensions/ext-card-desc";
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
import { renderMdInline } from "../../utils/dom/md";
import type { ExtensionMeta } from "../../types/extension";

export const TransportCard = ({
  transport,
}: {
  transport: ExtensionMeta;
}): JSX.Element => {
  const isEnabled = transport.settings["disabled"] !== "true";
  const toggleId = `transport-toggle-${transport.id}`;

  return (
    <ExtCard
      id={transport.id}
      nameRow={[
        extCardRestartWarningNode(transport),
        <ExtCardName
          htmlFor={toggleId}
          class="transport-toggle-label"
          name={transport.displayName}
        />,
      ]}
      info={[
        transport.description ? (
          <ExtCardDesc html={raw(renderMdInline(transport.description))} />
        ) : null,
        extCardVersionWarningNode(transport),
      ]}
      actions={[
        extCardBadgeNode(transport),
        extCardConfigureNode(transport, () => openModal(transport)),
        transport.configurable ? (
          <ExtToggle
            id={toggleId}
            inputClass="transport-toggle-input"
            dataId={transport.id}
            checked={isEnabled}
            onChange={extToggleHandler(transport.id, isEnabled, "transport")}
          />
        ) : null,
      ]}
    />
  );
};
