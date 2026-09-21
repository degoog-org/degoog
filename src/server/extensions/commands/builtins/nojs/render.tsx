import { renderHtml } from "../../../../../shared/ui/core/html";
import { Raw } from "../../../../../shared/ui/core/raw";
import { NojsLink } from "./link";
import { NojsPanel } from "./panel";

export const renderNojsMessage = (message: string): string =>
  renderHtml(
    <NojsPanel>
      <p>{message}</p>
    </NojsPanel>,
  );

export const renderNojsLink = (href: string, label: string): string =>
  renderHtml(<NojsLink href={href} label={label} />);

export const renderNojsLinkPanel = (linkHtml: string): string =>
  renderHtml(
    <NojsPanel>
      <Raw html={linkHtml} />
    </NojsPanel>,
  );

export const renderNojsRedirectPanel = (
  message: string,
  linkHtml: string,
): string =>
  renderHtml(
    <NojsPanel>
      <p>{message}</p>
      <Raw html={linkHtml} />
    </NojsPanel>,
  );
