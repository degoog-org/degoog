import { renderHtml } from "../../../../../shared/ui/core/html";
import { HelpContainer, type HelpContainerProps } from "./container";
import { HelpPanel } from "./panel";
import { HelpPrefixHint } from "./prefix-hint";
import { HelpTabButton } from "./tab-button";
import type { HelpRowCommand } from "./row";

export const renderTabButtons = (
  categories: string[],
  groups: Record<string, HelpRowCommand[]>,
): string =>
  categories
    .map((category, index) =>
      renderHtml(
        <HelpTabButton
          category={category}
          count={groups[category].length}
          active={index === 0}
        />,
      ),
    )
    .join("");

export const renderPanels = (
  categories: string[],
  groups: Record<string, HelpRowCommand[]>,
  nojs: boolean,
  aliasesLabel: (aliases: string) => string,
): string =>
  categories
    .map((category, index) =>
      renderHtml(
        <HelpPanel
          category={category}
          commands={groups[category]}
          active={nojs || index === 0}
          aliasesLabel={aliasesLabel}
        />,
      ),
    )
    .join("");

export const renderPrefixHint = (html: string): string =>
  renderHtml(<HelpPrefixHint html={html} />);

export const renderEngineTypeCode = (type: string): string =>
  renderHtml(<code>{`${type}:query`}</code>);

export const renderHelpContainer = (props: HelpContainerProps): string =>
  renderHtml(<HelpContainer {...props} />);
