import { RawDogIt } from "../../../../../shared/ui/tribute/rawdogit";
import { renderMdInline } from "../../../../utils/dom/md";
import type { Child } from "../../../../../shared/ui/tribute/types";

export const FieldDesc = ({ markdown }: { markdown: string }): JSX.Element => (
  <p class="ext-field-desc">
    <RawDogIt html={renderMdInline(markdown)} />
  </p>
);

export const fieldDesc = (markdown?: string): Child =>
  markdown ? <FieldDesc markdown={markdown} /> : null;
