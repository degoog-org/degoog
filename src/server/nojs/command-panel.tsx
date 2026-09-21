import { Raw } from "../../shared/ui/core/raw";
import {
  PANEL_BODY_CLASS,
  PANEL_CLASS,
  PANEL_TITLE_CLASS,
} from "./command-panel-classes";

export const CommandPanel = ({
  id,
  title,
  bodyHtml,
}: {
  id: string;
  title?: string;
  bodyHtml: string;
}): JSX.Element => (
  <div class={PANEL_CLASS} data-command={id}>
    {title ? <div class={PANEL_TITLE_CLASS}>{title}</div> : null}
    <div class={PANEL_BODY_CLASS}>
      <Raw html={bodyHtml} />
    </div>
  </div>
);
