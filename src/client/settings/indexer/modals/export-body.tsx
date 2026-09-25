import { tr } from "../i18n";

export const ExportBody = ({
  warningKey,
  showPicker,
}: {
  warningKey?: string;
  showPicker: boolean;
}): JSX.Element => (
  <>
    {warningKey ? <p class="indexer-memory-warning">{tr(warningKey)}</p> : null}
    {showPicker ? (
      <>
        <p>{tr("export-modal-desc")}</p>
        <div class="degoog-select-wrap"></div>
      </>
    ) : null}
  </>
);
