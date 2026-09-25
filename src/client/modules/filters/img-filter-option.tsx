export interface ImgFilterOptionProps {
  group: string;
  value: string;
  label: string;
  active: boolean;
}

export const ImgFilterOption = ({
  group,
  value,
  label,
  active,
}: ImgFilterOptionProps): JSX.Element => (
  <button
    type="button"
    class={
      active
        ? "degoog-img-filter-option is-active"
        : "degoog-img-filter-option"
    }
    role="radio"
    aria-checked={active ? "true" : "false"}
    data-group={group}
    data-value={value}
  >
    <span class="degoog-img-filter-text">{label}</span>
  </button>
);
