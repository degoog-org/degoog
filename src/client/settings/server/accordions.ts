const TOGGLE = "[data-settings-accordion]";

const _flip = (toggle: HTMLElement): void => {
  const section = toggle.closest<HTMLElement>(".settings-accordion");
  if (!section) return;
  const open = section.classList.toggle("open");
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
};

export function initSectionAccordions(container: HTMLElement): void {
  container.addEventListener("click", (event) => {
    const toggle = (event.target as HTMLElement).closest<HTMLElement>(TOGGLE);
    if (toggle && container.contains(toggle)) _flip(toggle);
  });
  container.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const toggle = (event.target as HTMLElement).closest<HTMLElement>(TOGGLE);
    if (!toggle || toggle !== event.target) return;
    event.preventDefault();
    _flip(toggle);
  });
}
