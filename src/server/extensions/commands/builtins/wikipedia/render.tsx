import { renderHtml } from "../../../../../shared/ui/core/html";
import { WikiThumbnail } from "./thumbnail";

export const renderWikiThumbnail = (
  src: string,
  alt: string,
  isLogo?: boolean,
): string => renderHtml(<WikiThumbnail src={src} alt={alt} isLogo={isLogo} />);
