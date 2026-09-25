import type { EventHandler } from "../../tribute/types";

export interface ExtToggleProps {
  id: string;
  inputClass: string;
  dataId: string;
  checked?: boolean;
  onChange?: EventHandler;
}

export const ExtToggle = ({
  id,
  inputClass,
  dataId,
  checked,
  onChange,
}: ExtToggleProps): JSX.Element => (
  <label class="engine-toggle degoog-toggle-wrap degoog-toggle-wrap--transparent">
    <input
      type="checkbox"
      class={inputClass}
      id={id}
      data-id={dataId}
      checked={checked === true}
      onChange={onChange}
    />
    <span class="toggle-slider degoog-toggle"></span>
  </label>
);
