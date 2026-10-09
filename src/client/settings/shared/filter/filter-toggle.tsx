export const FilterToggle = ({
  label,
  active,
  open,
  controls,
  onToggle,
}: {
  label: string;
  active: number;
  open: boolean;
  controls: string;
  onToggle: () => void;
}): JSX.Element => (
  <button
    type="button"
    class={active ? "filter-toggle filter-toggle--set" : "filter-toggle"}
    aria-expanded={String(open)}
    aria-controls={controls}
    onClick={onToggle}
  >
    <i class="fa-solid fa-sliders" aria-hidden="true"></i>
    <span>{label}</span>
    <span class="filter-toggle-n">{active ? String(active) : ""}</span>
  </button>
);
