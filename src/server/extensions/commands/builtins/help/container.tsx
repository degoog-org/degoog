import { HelpPanels } from "./panels";
import { HelpPrefixHint } from "./prefix-hint";
import { HelpTabButtons } from "./tab-buttons";
import type { HelpRowCommand } from "./row";

export interface HelpContainerProps {
  nojs: boolean;
  searchPlaceholder: string;
  prefixHint: string;
  categories: string[];
  groups: Record<string, HelpRowCommand[]>;
  aliasesLabel: (aliases: string) => string;
}

export const HelpContainer = ({
  nojs,
  searchPlaceholder,
  prefixHint,
  categories,
  groups,
  aliasesLabel,
}: HelpContainerProps): JSX.Element => (
  <div class="command-result help-container">
    {nojs ? null : (
      <div class="help-search-wrap degoog-search-bar degoog-search-bar--square-advanced">
        <i class="fa-solid fa-magnifying-glass search-icon"></i>
        <input
          type="text"
          class="search-input"
          placeholder={searchPlaceholder}
          id="help-search-input"
        />
      </div>
    )}
    {prefixHint ? <HelpPrefixHint html={prefixHint} /> : null}
    <div class="help-layout">
      {nojs ? null : (
        <div class="help-tabs">
          <HelpTabButtons categories={categories} groups={groups} />
        </div>
      )}
      <div class="help-panels">
        <HelpPanels
          categories={categories}
          groups={groups}
          nojs={nojs}
          aliasesLabel={aliasesLabel}
        />
      </div>
    </div>
  </div>
);
