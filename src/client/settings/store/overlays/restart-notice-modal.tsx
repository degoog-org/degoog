import { RawDogIt } from "../../../../shared/ui/tribute/rawdogit";
import { Button } from "../../../../shared/ui/components/primitives/button";
import { parseReason } from "../../shared/restart-state";
import { CONFIRM_MODAL_CLASS } from "../../../modules/modals/confirm-modal/confirm";

const t = window.scopedT("core");

export const RESTART_CONFIRM_CLASS = "store-restart-confirm";

const _Reason = ({ reason }: { reason: string }): JSX.Element => {
  const parsed = parseReason(reason);
  return parsed ? (
    <li>
      {parsed.name}
      <span>{`${parsed.type[0].toUpperCase()}${parsed.type.slice(1)}`}</span>
    </li>
  ) : (
    <li>{reason}</li>
  );
};

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
    class={`ext-modal ${CONFIRM_MODAL_CLASS}`}
    role="dialog"
    aria-modal="true"
    aria-labelledby="store-restart-title"
  >
    <div class="ext-modal-header">
      <h2 class="ext-modal-title" id="store-restart-title">
        {t("settings-page.restart.heading")}
      </h2>
      <button
        class="ext-modal-close degoog-icon-btn"
        type="button"
        aria-label={t("settings-page.restart.later")}
        onClick={onClose}
      >
        <RawDogIt html={"&times;"} />
      </button>
    </div>
    <div class="ext-modal-body">
      <div>
        <p>{t("settings-page.restart.modal-intro")}</p>
        <ul class="store-modal-list">
          {reasons.map((reason) => (
            <_Reason key={reason} reason={reason} />
          ))}
        </ul>
        <p>{t("settings-page.restart.modal-note")}</p>
      </div>
    </div>
    <div class="ext-modal-footer">
      <Button variant="secondary" onClick={onLater}>
        {t("settings-page.restart.later")}
      </Button>
      <Button variant="primary" class={RESTART_CONFIRM_CLASS}>
        {t("settings-page.restart.button")}
      </Button>
    </div>
  </div>
);
