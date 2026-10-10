import { Button } from "../../../../shared/ui/components/primitives/button";
import { FileUploadWidget } from "../../../utils/file-upload/file-upload-widget";
import { SettingGroup } from "../../shared/rows/setting-group";
import { SettingRow } from "../../shared/rows/setting-row";

const t = window.scopedT("core");

export const BackupBlock = (): JSX.Element => (
  <SettingGroup id="settings-server-backup">
    <SettingRow label={t("settings-page.server.backup.export-label")} desc={t("settings-page.server.backup.desc")}>
      <Button variant="secondary" id="settings-backup-export">
        {t("settings-page.server.backup.export-button")}
      </Button>
    </SettingRow>
    <SettingRow label={t("settings-page.server.backup.import-label")} desc={t("settings-page.server.backup.import-desc")}>
      <FileUploadWidget
        inputId="settings-backup-file"
        buttonLabel={t("settings-page.server.backup.import-choose")}
        dropLabel={t("settings-page.server.backup.import-drop")}
        accept="application/json,.json"
        extraClass="settings-file-compact"
      />
      <Button variant="secondary" id="settings-backup-import" disabled={true}>
        {t("settings-page.server.backup.import-button")}
      </Button>
    </SettingRow>
    <p class="settings-row-desc" id="settings-backup-status" role="status" aria-live="polite"></p>
  </SettingGroup>
);
