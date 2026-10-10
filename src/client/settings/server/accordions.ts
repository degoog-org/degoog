const TOGGLE = "[data-settings-accordion]";
const BUTTON = ".settings-accordion-button";

const _flip = (toggle: HTMLElement): void => {
  const section = toggle.closest<HTMLElement>(".settings-accordion");
  if (!section) return;
  const open = section.classList.toggle("open");
  section.querySelector(BUTTON)?.setAttribute("aria-expanded", open ? "true" : "false");
};

export function initSectionAccordions(container: HTMLElement): void {
  container.addEventListener("click", (event) => {
    const toggle = (event.target as HTMLElement).closest<HTMLElement>(TOGGLE);
    if (toggle && container.contains(toggle)) _flip(toggle);
  });
}
