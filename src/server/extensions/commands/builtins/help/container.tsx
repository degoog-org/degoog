import { Raw } from "../../../../../shared/ui/core/raw";

export interface HelpContainerProps {
  nojs: boolean;
  searchPlaceholder: string;
  prefixHint: string;
  tabButtons: string;
  panels: string;
}

export const HelpContainer = ({
  nojs,
  searchPlaceholder,
  prefixHint,
  tabButtons,
  panels,
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
    <Raw html={prefixHint} />
    <div class="help-layout">
      {nojs ? null : (
        <div class="help-tabs">
          <Raw html={tabButtons} />
        </div>
      )}
      <div class="help-panels">
        <Raw html={panels} />
      </div>
    </div>
  </div>
);
