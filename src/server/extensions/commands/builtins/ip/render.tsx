import { renderHtml } from "../../../../../shared/ui/tribute/html";
import { IpDetectRoot } from "./detect-root";
import { IpInfo } from "./info";
import { IpMessage } from "./message";

export const renderDetectRoot = (message: string): string =>
  renderHtml(<IpDetectRoot message={message} />);

export const renderMessage = (text: string): string =>
  renderHtml(<IpMessage text={text} />);

export const renderInfo = (fields: Array<[string, string]>): string =>
  renderHtml(<IpInfo fields={fields} />);
