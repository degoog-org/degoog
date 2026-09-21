import { raw } from "../../../shared/ui/core/raw";
import { Badge } from "../../../shared/ui/components/primitives/badge";
import { DragHandle } from "../../../shared/ui/components/extensions/drag-handle";
import { ExtCard } from "../../../shared/ui/components/extensions/ext-card";
import { ExtCardDesc } from "../../../shared/ui/components/extensions/ext-card-desc";
import { ExtCardName } from "../../../shared/ui/components/extensions/ext-card-name";
import { ExtToggle } from "../../../shared/ui/components/extensions/ext-toggle";
import { ExposureBadge } from "./exposure-badge";
import {
  extCardBadgeNode,
  extCardConfigureNode,
  extCardRestartWarningNode,
  extCardVersionWarningNode,
} from "../shared/ext-card";
import { extToggleHandler } from "../shared/ext-toggle";
import { openModal } from "../../modules/modals/settings-modal/modal";
import type { ExtensionMeta } from "../../types";
import { renderMdInline } from "../../utils/md";

const t = window.scopedT("core");

const _canDisable = (plugin: ExtensionMeta): boolean =>
  plugin.configurable ||
  plugin.id.endsWith("-slot") ||
  (plugin.id.endsWith("-command") && plugin.source !== "builtin");

export const PluginCard = ({
  plugin,
  orderable,
}: {
  plugin: ExtensionMeta;
  orderable: boolean;
}): JSX.Element => {
  const isEnabled = plugin.settings["disabled"] !== "true";
  const toggleId = `plugin-toggle-${plugin.id}`;

  return (
    <ExtCard
      id={plugin.id}
      nameRow={[
        <ExposureBadge plugin={plugin} />,
        extCardRestartWarningNode(plugin),
        <ExtCardName htmlFor={toggleId} class="plugin-toggle-label" name={plugin.displayName} />,
        plugin.source === "builtin" ? <Badge>Built-in</Badge> : null,
      ]}
      info={[
        plugin.description ? <ExtCardDesc html={raw(renderMdInline(plugin.description))} /> : null,
        extCardVersionWarningNode(plugin),
      ]}
      actions={[
        extCardBadgeNode(plugin),
        extCardConfigureNode(plugin, () => openModal(plugin)),
        _canDisable(plugin) ? (
          <ExtToggle
            id={toggleId}
            inputClass="plugin-toggle-input"
            dataId={plugin.id}
            checked={isEnabled}
            onChange={extToggleHandler(plugin.id, isEnabled, "plugin")}
          />
        ) : null,
        orderable ? <DragHandle label={t("settings-page.extensions.drag-to-reorder")} /> : null,
      ]}
    />
  );
};
