import { ExtCard } from "../../../shared/ui/components/extensions/ext-card";
import { ExtCardActive } from "../../../shared/ui/components/extensions/ext-card-active";
import { ExtCardDesc } from "../../../shared/ui/components/extensions/ext-card-desc";
import { ExtCardNameText } from "../../../shared/ui/components/extensions/ext-card-name-text";
import { ApplyButton } from "./apply-button";

const t = window.scopedT("core");

export const BuiltInCard = ({ activeId }: { activeId: string | null }): JSX.Element => {
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
