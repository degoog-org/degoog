import { renderHtml } from "../../../../../shared/ui/tribute/html";
import { HelpContainer, type HelpContainerProps } from "./container";
import { HelpPanels } from "./panels";
import { HelpPrefixHint } from "./prefix-hint";
import { HelpTabButtons } from "./tab-buttons";
import type { HelpRowCommand } from "./row";

export const renderTabButtons = (
  categories: string[],
  groups: Record<string, HelpRowCommand[]>,
): string =>
  renderHtml(<HelpTabButtons categories={categories} groups={groups} />);

export const renderPanels = (
  categories: string[],
  groups: Record<string, HelpRowCommand[]>,
  nojs: boolean,
  aliasesLabel: (aliases: string) => string,
): string =>
  renderHtml(
    <HelpPanels
      categories={categories}
      groups={groups}
      nojs={nojs}
      aliasesLabel={aliasesLabel}
    />,
  );

export const renderPrefixHint = (html: string): string =>
  html ? renderHtml(<HelpPrefixHint html={html} />) : "";

export const renderEngineTypeCode = (type: string): string =>
  renderHtml(<code>{`${type}:query`}</code>);

export const renderHelpContainer = (props: HelpContainerProps): string =>
  renderHtml(<HelpContainer {...props} />);
