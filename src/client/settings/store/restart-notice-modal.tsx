import { RawDogIt } from "../../../shared/ui/tribute/rawdogit";
import { Button } from "../../../shared/ui/components/primitives/button";
import { formatReason } from "../shared/restart-state";

const t = window.scopedT("core");

export interface RestartNoticeModalProps {
  reasons: string[];
  onClose: () => void;
  onLater: () => void;
}

export const RestartNoticeModal = ({
  reasons,
  onClose,
  onLater,
}: RestartNoticeModalProps): JSX.Element => (
  <div
    class="ext-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="store-restart-title"
  >
    <div class="ext-modal-header">
      <h2 class="ext-modal-title" id="store-restart-title">
        {t("settings-page.restart.heading")}
      </h2>
      <button
        class="ext-modal-close degoog-icon-btn store-restart-close"
        type="button"
        aria-label={t("settings-page.restart.later")}
        onClick={onClose}
      >
        <RawDogIt html={"&times;"} />
      </button>
    </div>
    <div class="ext-modal-body">
      <p class="store-restart-intro">
        {t("settings-page.restart.modal-intro")}
      </p>
      <ul class="store-restart-list">
        {reasons.map((reason) => (
          <li key={reason}>{`• ${formatReason(reason)}`}</li>
        ))}
      </ul>
      <p class="store-restart-note">{t("settings-page.restart.modal-note")}</p>
    </div>
    <div class="ext-modal-footer store-restart-footer">
      <Button variant="secondary" class="store-restart-confirm">
        {t("settings-page.restart.button")}
      </Button>
      <Button variant="primary" class="store-restart-later" onClick={onLater}>
        {t("settings-page.restart.later")}
      </Button>
    </div>
  </div>
);
