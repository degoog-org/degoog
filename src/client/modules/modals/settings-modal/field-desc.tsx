import { Raw } from "../../../../shared/ui/core/raw";
import { renderHtml } from "../../../../shared/ui/core/html";
import { renderMdInline } from "../../../utils/md";

export const FieldDesc = ({ markdown }: { markdown: string }): JSX.Element => (
  <p class="ext-field-desc">
    <Raw html={renderMdInline(markdown)} />
  </p>
);

export const renderFieldDesc = (markdown?: string): string =>
  markdown ? renderHtml(<FieldDesc markdown={markdown} />) : "";
