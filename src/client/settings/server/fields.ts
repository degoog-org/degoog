import { getInputElement } from "../../utils/dom";

export type BoolSetting = boolean | string;

export const el = (id: string) => getInputElement(`settings-${id}`);
export const val = (id: string) => el(id)?.value.trim() ?? "";
export const boolStr = (id: string) => (el(id)?.checked ? "true" : "false");

export function bindToggle(checkboxId: string, wrapId: string): void {
  const checkbox = el(checkboxId);
  const wrap = el(wrapId);
  if (checkbox && wrap) {
    const update = () => {
      wrap.style.display = checkbox.checked ? "block" : "none";
    };
    checkbox.addEventListener("change", update);
    update();
  }
}

export function setToggle(id: string, state?: BoolSetting): void {
  const checkbox = el(id);
  if (checkbox && state !== undefined) {
    checkbox.checked = state === true || state === "true";
    checkbox.dispatchEvent(new Event("change"));
  }
}

export function setVal(id: string, value?: string): void {
  const element = el(id);
  if (element && value !== undefined) element.value = value;
}
