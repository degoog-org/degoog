export interface HelpTabButtonProps {
  category: string;
  count: number;
  active: boolean;
}

export const HelpTabButton = ({ category, count, active }: HelpTabButtonProps): JSX.Element => (
  <button class={active ? "help-tab active" : "help-tab"} data-help-cat={category}>
    {category} <span class="help-tab-count">{count}</span>
  </button>
);
