import { CHEVRON_SVG } from "../../../../shared/ui/components/layout/chevron";
import { raw } from "../../../../shared/ui/tribute/rawdogit";
import { UpdatesRow } from "./updates-row";
import type { StoreItem } from "../../../types/store-tab";

export interface UpdatesPanelProps {
  items: StoreItem[];
  onToggle: () => void;
  onUpdateAll: () => void;
  onUpdate: (button: HTMLButtonElement) => void;
}

export const UpdatesPanel = ({
  items,
  onToggle,
  onUpdateAll,
  onUpdate,
}: UpdatesPanelProps): JSX.Element => (
  <>
    <div class="store-updates-header">
      <button
        class="store-updates-toggle degoog-accordion-toggle"
        type="button"
        onClick={onToggle}
      >
        <span>{`Updates available (${items.length})`}</span>
        {raw(CHEVRON_SVG)}
      </button>
      <button
        class="btn btn--primary degoog-btn degoog-btn--primary store-btn-update-all"
        type="button"
        onClick={onUpdateAll}
      >
        Update all
      </button>
    </div>
    <div class="store-updates-body degoog-accordion-body degoog-accordion-body--flex">
      {items.map((item) => (
        <UpdatesRow
          key={`${item.repoUrl}::${item.path}::${item.type}`}
          item={item}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  </>
);
