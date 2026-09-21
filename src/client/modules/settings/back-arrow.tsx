import { raw } from "../../../shared/ui/core/raw";

export const BACK_ARROW_SVG =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';

export const BackArrow = (): JSX.Element => raw(BACK_ARROW_SVG);
