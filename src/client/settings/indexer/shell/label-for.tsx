import { LABEL } from "./shell-consts";
import { tr } from "../i18n";

export const LabelFor = ({ id, k }: { id: string; k: string }): JSX.Element => (
  <label class={LABEL} for={id}>
    {tr(k)}
  </label>
);
