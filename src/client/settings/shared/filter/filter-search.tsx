export const FilterSearch = ({
  id,
  placeholder,
  clearLabel,
  value,
  onInput,
  onClear,
}: {
  id: string;
  placeholder: string;
  clearLabel: string;
  value: string;
  onInput: (value: string) => void;
  onClear: () => void;
}): JSX.Element => (
  <label class="filter-search">
    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
    <input
      type="search"
      class="degoog-input"
      id={id}
      placeholder={placeholder}
      autocomplete="off"
      spellcheck="false"
      aria-label={placeholder}
      value={value}
      onInput={(event) => onInput((event.currentTarget as HTMLInputElement).value)}
      onKeyDown={(event) => {
        if ((event as KeyboardEvent).key !== "Escape" || !value) return;
        event.stopPropagation();
        onClear();
      }}
    />
    <button
      type="button"
      class="filter-search-clear"
      aria-label={clearLabel}
      hidden={!value}
      onClick={onClear}
    >
      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
    </button>
  </label>
);
