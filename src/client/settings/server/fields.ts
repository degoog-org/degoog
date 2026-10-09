import { getInputElement } from "../../utils/dom/dom";
import type { BoolSetting } from "../../types/settings-server";

export const el = (id: string) => getInputElement(`settings-${id}`);
export const val = (id: string) => el(id)?.value.trim() ?? "";
export const boolStr = (id: string) => (el(id)?.checked ? "true" : "false");

export function setToggle(id: string, state?: BoolSetting): void {
  const checkbox = el(id);
  if (checkbox && state !== undefined) {
    checkbox.checked = state === true || state === "true";
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

export function setSelect(id: string, value?: string): void {
  const select = document.getElementById(`settings-${id}`);
  if (!(select instanceof HTMLSelectElement) || value === undefined) return;
  const known = [...select.options].some((option) => option.value === value);
  if (known) select.value = value;
}

export function setVal(id: string, value?: string): void {
  const element = el(id);
  if (element && value !== undefined) element.value = value;
}
