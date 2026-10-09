const DEP_SELECTOR = "[data-dep]";

const _visible = (el: HTMLElement): boolean => {
  const input = document.getElementById(el.dataset.dep ?? "");
  if (!(input instanceof HTMLInputElement) || !input.checked) return false;
  return !input.closest<HTMLElement>(`${DEP_SELECTOR}[hidden]`);
};

export function syncDependents(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(DEP_SELECTOR).forEach((el) => {
    el.hidden = !_visible(el);
  });
}

export function bindDependents(root: HTMLElement): void {
  root.addEventListener("change", (e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === "checkbox") syncDependents(root);
  });
  syncDependents(root);
}
