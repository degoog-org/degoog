import { Raw } from "../../core/raw";

export const SLOT_PANEL_CLASS =
  "results-slot-panel degoog-panel degoog-panel--slot degoog-panel--stack-item";
export const SLOT_TITLE_CLASS =
  "results-slot-panel-title degoog-panel--slot-title";
export const SLOT_BODY_CLASS =
  "results-slot-panel-body degoog-panel--slot-body degoog-panel--slot-body-padded";
export const DEFAULT_SLOT_GRID = 4;

export interface SlotPanelProps {
  id?: string;
  title?: string;
  html: string;
  grid?: number | null;
}

export const SlotPanel = ({ id, title, html, grid }: SlotPanelProps): JSX.Element => (
  <div class={SLOT_PANEL_CLASS} data-slot={id} data-grid={grid ?? undefined}>
    {title ? <div class={SLOT_TITLE_CLASS}>{title}</div> : null}
    <div class={SLOT_BODY_CLASS}>
      <Raw html={html} />
    </div>
  </div>
);
