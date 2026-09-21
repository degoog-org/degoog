import { Button } from "../../../shared/ui/components/primitives/button";
import { Icon } from "../../../shared/ui/components/primitives/icon";
import { ShortcutToggle } from "./shortcut-toggle";
import type { ShortcutActionMeta } from "../../../shared/shortcuts";

const t = window.scopedT("core");

export const ShortcutCard = ({
  action,
  label,
  canDisable,
  onRecord,
  onReset,
  onDelete,
  onToggle,
}: {
  action: ShortcutActionMeta;
  label: string;
  canDisable: boolean;
  onRecord: (button: HTMLButtonElement) => void;
  onReset: () => void;
  onDelete: () => void;
  onToggle: (event: Event) => void;
}): JSX.Element => (
  <div class="ext-card degoog-panel degoog-panel--ext-card" data-action={action.id}>
    <div class="ext-card-main">
      <div class="ext-card-info">
        <span class="ext-card-name">
          {action.displayName || t(`settings-page.shortcuts.actions.${action.id}.label`)}
        </span>
        <span class="ext-card-desc">
          {action.description || t(`settings-page.shortcuts.actions.${action.id}.desc`)}
        </span>
      </div>
      <div class="ext-card-actions">
        <Button
          variant="secondary"
          class="shortcut-recorder"
          data-action={action.id}
          onClick={(event) => onRecord(event.currentTarget as HTMLButtonElement)}
        >
          {label}
        </Button>
        <button
          type="button"
          class="degoog-icon-btn shortcut-reset"
          data-action={action.id}
          aria-label={t("settings-page.shortcuts.reset")}
          onClick={onReset}
        >
          <Icon name="fa-solid fa-rotate-left" />
        </button>
        {action.editable ? (
          <button
            type="button"
            class="degoog-icon-btn shortcut-delete"
            data-action={action.id}
            aria-label={t("settings-page.shortcuts.delete")}
            onClick={onDelete}
          >
            <Icon name="fa-solid fa-trash" />
          </button>
        ) : null}
        {canDisable ? <ShortcutToggle action={action} onChange={onToggle} /> : null}
      </div>
    </div>
  </div>
);
