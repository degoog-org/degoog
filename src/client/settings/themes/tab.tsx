import { render } from "../../../shared/ui/core/dom";
import { Button } from "../../../shared/ui/components/primitives/button";
import { ExtCard } from "../../../shared/ui/components/extensions/ext-card";
import { ExtCardActive } from "../../../shared/ui/components/extensions/ext-card-active";
import { ExtCardDesc } from "../../../shared/ui/components/extensions/ext-card-desc";
import { ExtCardNameText } from "../../../shared/ui/components/extensions/ext-card-name-text";
import { ExtGroup } from "../../../shared/ui/components/extensions/ext-group";
import {
  extCardBadgeNode,
  extCardConfigureNode,
  extCardVersionWarningNode,
} from "../shared/ext-card";
import { openModal } from "../../modules/modals/settings-modal/modal";
import type { ExtensionMeta } from "../../types";
import { getBase } from "../../utils/base-url";

const t = window.scopedT("core");
const themeT = window.scopedT("themes/degoog");

const _applyTheme = async (id: string | null, button: HTMLButtonElement): Promise<void> => {
  button.disabled = true;
  try {
    const res = await fetch(`${getBase()}/api/theme/active`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error("Failed");
    window.location.reload();
  } catch {
    button.disabled = false;
  }
};

const ApplyButton = ({
  themeId,
  disabled,
}: {
  themeId: string;
  disabled: boolean;
}): JSX.Element => (
  <Button
    variant="secondary"
    class="ext-card-apply"
    data-theme-id={themeId}
    disabled={disabled}
    onClick={(event) =>
      void _applyTheme(
        themeId === "built-in" ? null : themeId,
        event.currentTarget as HTMLButtonElement,
      )
    }
  >
    {themeT("search-templates.tabs.apply")}
  </Button>
);

const ThemeCard = ({
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

const BuiltInCard = ({ activeId }: { activeId: string | null }): JSX.Element => {
  const isActive = activeId === null;
  return (
    <ExtCard
      themeId="built-in"
      info={[
        <ExtCardNameText name={t("settings-page.extensions.built-in-theme-name")} />,
        <ExtCardDesc html={t("settings-page.extensions.built-in-theme-desc")} />,
        isActive ? <ExtCardActive label={t("settings-page.extensions.active")} /> : null,
      ]}
      actions={<ApplyButton themeId="built-in" disabled={isActive} />}
    />
  );
};

export async function initThemesTab(
  themesData: { activeId: string | null },
  themeExts: ExtensionMeta[],
): Promise<void> {
  const container = document.getElementById("themes-content");
  if (!container) return;

  const activeId = themesData.activeId;
  render(
    <ExtGroup label={t("settings-page.extensions.group-themes")}>
      <BuiltInCard activeId={activeId} />
      {themeExts.map((ext) => (
        <ThemeCard key={ext.id} ext={ext} activeId={activeId} />
      ))}
    </ExtGroup>,
    container,
  );
}
