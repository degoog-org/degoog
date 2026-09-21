import { Raw } from "../../../../shared/ui/core/raw";
import { renderMdInline } from "../../../utils/md";
import type { Child } from "../../../../shared/ui/core/types";

export const FieldDesc = ({ markdown }: { markdown: string }): JSX.Element => (
  <p class="ext-field-desc">
    <Raw html={renderMdInline(markdown)} />
  </p>
);

export const fieldDesc = (markdown?: string): Child =>
  markdown ? <FieldDesc markdown={markdown} /> : null;
