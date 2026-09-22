import {
  PANEL_BODY_CLASS,
  PANEL_CLASS,
  PANEL_TITLE_CLASS,
} from "./command-panel-classes";
import type { Child } from "../../shared/ui/tribute/types";

export const CommandPanel = ({
  id,
  title,
  children,
}: {
  id: string;
  title?: string;
  children?: Child;
}): JSX.Element => (
  <div class={PANEL_CLASS} data-command={id}>
    {title ? <div class={PANEL_TITLE_CLASS}>{title}</div> : null}
    <div class={PANEL_BODY_CLASS}>{children}</div>
  </div>
);
