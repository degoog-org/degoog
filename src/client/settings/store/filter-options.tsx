export interface FilterOption {
  id: string;
  label: string;
  count: number;
}

export const FilterOptions = ({
  options,
  selected,
}: {
  options: FilterOption[];
  selected: string;
}): JSX.Element => (
  <>
    {options.map((option) => (
      <option key={option.id} value={option.id} selected={selected === option.id}>
        {`${option.label} (${option.count})`}
      </option>
    ))}
  </>
);
