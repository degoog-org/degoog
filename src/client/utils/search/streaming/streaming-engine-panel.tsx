import { Chevron } from "../../../../shared/ui/components/layout/chevron";
import {
  SIDEBAR_BODY_CLASS,
  SIDEBAR_TOGGLE_CLASS,
} from "../../../../shared/ui/components/layout/sidebar-accordion";

const t = window.scopedT("themes/degoog");

export const StreamingEnginePanel = ({ onToggle }: { onToggle: () => void }): JSX.Element => (
  <>
    <button class={SIDEBAR_TOGGLE_CLASS} type="button" onClick={onToggle}>
      <span>{t("search-templates.sidebar.engine-performance")}</span>
      <Chevron />
    </button>
    <div class={SIDEBAR_BODY_CLASS}></div>
  </>
);
