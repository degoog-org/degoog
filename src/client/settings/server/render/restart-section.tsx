import { Button } from "../../../../shared/ui/components/primitives/button";
import { ServerSection } from "./server-section";

const t = window.scopedT("core");

export const RestartSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-restart"
    heading="settings-page.server.restart-heading"
    icon="fa-solid fa-power-off"
    desc="settings-page.server.restart-desc"
  >
    <div class="settings-server-restart-pending" id="settings-server-restart-pending" hidden={true}>
      <p class="store-restart-intro">{t("settings-page.restart.modal-intro")}</p>
      <ul class="store-restart-list" id="settings-server-restart-reasons"></ul>
    </div>
    <Button variant="secondary" id="settings-server-restart">
      {t("settings-page.server.restart-button")}
    </Button>
  </ServerSection>
);
