import type { ShortcutActionMeta } from "../../../shared/shortcuts";

const t = window.scopedT("core");

export const ShortcutToggle = ({
  action,
  onChange,
}: {
  action: ShortcutActionMeta;
  onChange: (event: Event) => void;
}): JSX.Element => (
  <label class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
    <input
      type="checkbox"
      class="shortcut-toggle-input"
      data-action={action.id}
      checked={!action.disabled}
      aria-label={t("settings-page.shortcuts.enable-aria")}
      onChange={onChange}
    />
    <span class="toggle-slider degoog-toggle"></span>
  </label>
);
