import { Button } from "../../../../shared/ui/components/primitives/button";
import { FileUploadWidget } from "../../../utils/file-upload/file-upload-widget";
import { SectionDesc } from "./section-desc";
import { SubHeading } from "./sub-heading";

const t = window.scopedT("core");

export const BackupBlock = (): JSX.Element => (
  <div class="settings-server-block" id="settings-server-backup">
    <SubHeading k="settings-page.server.config.backup-label" />
    <SectionDesc k="settings-page.server.backup.desc" />
    <p class="settings-desc settings-backup-note">
      {t("settings-page.server.backup.manual-extensions")}
    </p>
    <div class="settings-backup-row">
      <Button variant="secondary" class="settings-backup-action" id="settings-backup-export">
        {t("settings-page.server.backup.export-button")}
      </Button>
      <FileUploadWidget
        inputId="settings-backup-file"
        buttonLabel={t("settings-page.server.backup.import-choose")}
        dropLabel={t("settings-page.server.backup.import-drop")}
        accept="application/json,.json"
      />
      <Button
        variant="primary"
        class="settings-backup-action"
        id="settings-backup-import"
        disabled={true}
      >
        {t("settings-page.server.backup.import-button")}
      </Button>
    </div>
    <span
      class="settings-server-preset-status"
      id="settings-backup-status"
      role="status"
      aria-live="polite"
    ></span>
  </div>
);
