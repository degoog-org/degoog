import { Raw } from "../../../shared/ui/core/raw";
import { renderFileUpload } from "../../utils/file-upload";
import { tr } from "./i18n";

export interface ImportBodyProps {
  engineTypes: string[];
  customTypeValue: string;
  progressHostId: string;
}

export const ImportBody = ({
  engineTypes,
  customTypeValue,
  progressHostId,
}: ImportBodyProps): JSX.Element => (
  <>
    <p>{tr("import-modal-desc")}</p>
    <div class="degoog-select-wrap">
      <select id="indexer-import-type" class="degoog-input">
        {engineTypes.map((engineType) => (
          <option key={engineType} value={engineType}>
            {engineType}
          </option>
        ))}
        <option value={customTypeValue}>{tr("import-type-custom")}</option>
      </select>
    </div>
    <input
      type="text"
      id="indexer-import-custom-type"
      class="degoog-input"
      style="margin-top:8px"
      hidden={true}
    />
    <div style="margin-top:8px">
      <Raw
        html={renderFileUpload({
          inputId: "indexer-import-file",
          accept: ".db,.sql",
          buttonLabel: tr("import-choose-file"),
          dropLabel: tr("import-drop-hint"),
        })}
      />
    </div>
    <div id={progressHostId} style="margin-top:8px"></div>
  </>
);
