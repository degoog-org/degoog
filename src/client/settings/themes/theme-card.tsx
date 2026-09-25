import { ExtCard } from "../../../shared/ui/components/extensions/ext-card";
import { ExtCardActive } from "../../../shared/ui/components/extensions/ext-card-active";
import { ExtCardDesc } from "../../../shared/ui/components/extensions/ext-card-desc";
import { ExtCardNameText } from "../../../shared/ui/components/extensions/ext-card-name-text";
import {
  extCardBadgeNode,
  extCardConfigureNode,
  extCardVersionWarningNode,
} from "../shared/ext-card";
import { ApplyButton } from "./apply-button";
import { openModal } from "../../modules/modals/settings-modal/modal";
import type { ExtensionMeta } from "../../types/extension";

const t = window.scopedT("core");

export const ThemeCard = ({
  ext,
  activeId,
}: {
  ext: ExtensionMeta;
  activeId: string | null;
}): JSX.Element => {
  const isActive = activeId === ext.id;
  return (
    <ExtCard
      themeId={ext.id}
      info={[
        <ExtCardNameText name={ext.displayName} />,
        ext.description ? <ExtCardDesc html={ext.description} /> : null,
        isActive ? <ExtCardActive label={t("settings-page.extensions.active")} /> : null,
        extCardVersionWarningNode(ext),
      ]}
      actions={[
        extCardBadgeNode(ext),
        extCardConfigureNode(ext, () => openModal(ext)),
        <ApplyButton themeId={ext.id} disabled={isActive} />,
      ]}
    />
  );
};
