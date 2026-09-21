import { renderHtml } from "../../../../../shared/ui/core/html";
import { NojsLink } from "./link";
import { NojsPanel } from "./panel";

export const renderNojsMessage = (message: string): string =>
  renderHtml(
    <NojsPanel>
      <p>{message}</p>
    </NojsPanel>,
  );

export const renderNojsLinkPanel = (href: string, label: string): string =>
  renderHtml(
    <NojsPanel>
      <NojsLink href={href} label={label} />
    </NojsPanel>,
  );

export const renderNojsRedirectPanel = (
  message: string,
  href: string,
  label: string,
): string =>
  renderHtml(
    <NojsPanel>
      <p>{message}</p>
      <NojsLink href={href} label={label} />
    </NojsPanel>,
  );
