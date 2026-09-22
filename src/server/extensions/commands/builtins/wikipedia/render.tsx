import { renderHtml } from "../../../../../shared/ui/tribute/html";
import { WikiThumbnail } from "./thumbnail";

export const renderWikiThumbnail = (
  src: string,
  alt: string,
  isLogo?: boolean,
): string => renderHtml(<WikiThumbnail src={src} alt={alt} isLogo={isLogo} />);
