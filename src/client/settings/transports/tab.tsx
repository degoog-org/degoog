import { render } from "../../../shared/ui/core/dom";
import { raw } from "../../../shared/ui/core/raw";
import { ExtCard } from "../../../shared/ui/components/extensions/ext-card";
import { ExtCardDesc } from "../../../shared/ui/components/extensions/ext-card-desc";
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
import { renderMdInline } from "../../utils/md";

const t = window.scopedT("core");

const BUILTIN_IDS = new Set([
  "transport-fetch",
  "transport-curl",
  "transport-curl-impersonate",
  "transport-curl-fallback",
]);

const TransportCard = ({ transport }: { transport: ExtensionMeta }): JSX.Element => {
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

export function initTransportsTab(allExtensions: AllExtensions): void {
  const container = document.getElementById("transports-content");
  if (!container) return;

  const transports = allExtensions.transports ?? [];
  const custom = transports.filter((transport) => !BUILTIN_IDS.has(transport.id));
  const builtin = transports.filter((transport) => BUILTIN_IDS.has(transport.id));

  const group = (labelKey: string, items: ExtensionMeta[]): JSX.Element | null =>
    items.length === 0 ? null : (
      <ExtGroup label={t(labelKey)}>
        {items.map((transport) => (
          <TransportCard key={transport.id} transport={transport} />
        ))}
      </ExtGroup>
    );

  render(
    [
      group("settings-page.extensions.group-transports", custom),
      group("settings-page.extensions.group-builtin-transports", builtin),
    ].filter((node) => node !== null),
    container,
  );
}
