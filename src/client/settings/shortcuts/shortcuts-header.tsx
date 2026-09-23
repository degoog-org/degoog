import { Button } from "../../../shared/ui/components/primitives/button";
import { Section } from "../../../shared/ui/components/layout/section";

const t = window.scopedT("core");

export const ShortcutsHeader = ({
  onAdd,
  onResetAll,
}: {
  onAdd: () => void;
  onResetAll: () => void;
}): JSX.Element => (
  <Section
    icon="fa-solid fa-keyboard"
    heading={t("settings-page.shortcuts.heading")}
    desc={t("settings-page.shortcuts.desc")}
  >
    <div class="settings-page-actions">
      <Button variant="primary" id="shortcuts-add" onClick={onAdd}>
        {t("settings-page.shortcuts.add")}
      </Button>
      <Button variant="secondary" id="shortcuts-reset-all" onClick={onResetAll}>
        {t("settings-page.shortcuts.reset-all")}
      </Button>
    </div>
  </Section>
);
