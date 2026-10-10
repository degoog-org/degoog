export interface FilterOption {
  value: string;
  label: string;
}

export const FilterSelect = ({
  label,
  options,
  value,
  isSet,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  isSet: boolean;
  onChange: (value: string) => void;
}): JSX.Element => (
  <span class={isSet ? "degoog-select-wrap filter-select filter-select--set" : "degoog-select-wrap filter-select"}>
    <select
      class="degoog-select"
      aria-label={label}
      onChange={(event) => onChange((event.currentTarget as HTMLSelectElement).value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} selected={option.value === value}>
          {option.label}
        </option>
      ))}
    </select>
  </span>
);
