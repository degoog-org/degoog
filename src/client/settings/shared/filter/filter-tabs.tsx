export interface FilterTab {
  value: string;
  label: string;
  count: number;
}

const TAB_SCROLL_GAP = 8;

const _step = (
  event: KeyboardEvent,
  tabs: FilterTab[],
  value: string,
  onSelect: (value: string, focus: boolean) => void,
): void => {
  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
  const enabled = tabs.filter((tab) => tab.count > 0 || tab.value === value);
  const index = enabled.findIndex((tab) => tab.value === value);
  const delta = event.key === "ArrowRight" ? 1 : -1;
  onSelect(enabled[(index + delta + enabled.length) % enabled.length].value, true);
};

export const revealActiveTab = (id: string): void => {
  const bar = document.getElementById(id);
  const active = bar?.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!bar || !active) return;
  const left = active.offsetLeft;
  if (left < bar.scrollLeft || left + active.offsetWidth > bar.scrollLeft + bar.clientWidth)
    bar.scrollLeft = left - TAB_SCROLL_GAP;
};

export const focusTab = (id: string, value: string): void => {
  document
    .getElementById(id)
    ?.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`)
    ?.focus();
};

export const FilterTabs = ({
  id,
  label,
  tabs,
  value,
  onSelect,
}: {
  id: string;
  label: string;
  tabs: FilterTab[];
  value: string;
  onSelect: (value: string, focus: boolean) => void;
}): JSX.Element => (
  <div class="filter-tabs" id={id} role="tablist" aria-label={label}>
    {tabs.map((tab) => {
      const active = tab.value === value;
      return (
        <button
          key={tab.value}
          type="button"
          role="tab"
          class="filter-tab"
          data-value={tab.value}
          aria-selected={String(active)}
          tabindex={active ? "0" : "-1"}
          disabled={tab.count === 0 && !active}
          onClick={() => onSelect(tab.value, false)}
          onKeyDown={(event) => _step(event as KeyboardEvent, tabs, value, onSelect)}
        >
          {tab.label}
          <span class="filter-tab-count">{tab.count.toLocaleString()}</span>
        </button>
      );
    })}
  </div>
);
