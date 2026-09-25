import { Button } from "../../../../shared/ui/components/primitives/button";

const t = window.scopedT("core");

export const ResetDefaultsButton = (): JSX.Element => (
  <Button variant="secondary" id="settings-sync-reset-defaults">
    {t("settings-page.sync.reset-button")}
  </Button>
);
