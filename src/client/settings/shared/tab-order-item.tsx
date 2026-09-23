import { DragHandle } from "../../../shared/ui/components/extensions/drag-handle";
import type { TypeEntry } from "../../types/engines-tab";

const t = window.scopedT("core");

export const TabOrderItem = ({ entry }: { entry: TypeEntry }): JSX.Element => (
  <li
    class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact"
    data-key={entry.key}
  >
    <div class="ext-card-main">
      <span class="ext-card-name">{entry.label}</span>
      <DragHandle label={t("settings-page.extensions.drag-to-reorder")} />
    </div>
  </li>
);
