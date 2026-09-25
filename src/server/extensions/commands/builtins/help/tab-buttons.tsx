import { HelpTabButton } from "./tab-button";
import type { HelpRowCommand } from "./row";

export interface HelpTabButtonsProps {
  categories: string[];
  groups: Record<string, HelpRowCommand[]>;
}

export const HelpTabButtons = ({
  categories,
  groups,
}: HelpTabButtonsProps): JSX.Element => (
  <>
    {categories.map((category, index) => (
      <HelpTabButton
        category={category}
        count={groups[category].length}
        active={index === 0}
      />
    ))}
  </>
);
