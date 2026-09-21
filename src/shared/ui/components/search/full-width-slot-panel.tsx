import { Raw } from "../../core/raw";
import type { SlotPanelProps } from "./slot-panel";

export const SLOT_FULL_WIDTH_CLASS = "results-slot-panel-full-width";

export const FullWidthSlotPanel = ({ id, html }: SlotPanelProps): JSX.Element => (
  <div class={SLOT_FULL_WIDTH_CLASS} data-slot={id}>
    <Raw html={html} />
  </div>
);
