import { HelpPanel } from "./panel";
import type { HelpRowCommand } from "./row";

export interface HelpPanelsProps {
  categories: string[];
  groups: Record<string, HelpRowCommand[]>;
  nojs: boolean;
  aliasesLabel: (aliases: string) => string;
}

export const HelpPanels = ({
  categories,
  groups,
  nojs,
  aliasesLabel,
}: HelpPanelsProps): JSX.Element => (
  <>
    {categories.map((category, index) => (
      <HelpPanel
        category={category}
        commands={groups[category]}
        active={nojs || index === 0}
        aliasesLabel={aliasesLabel}
      />
    ))}
  </>
);
