import { renderHtml } from "../../../../../shared/ui/core/html";
import { GlanceBox, type GlanceBoxProps } from "./glance-box";

export const renderGlanceBox = (props: GlanceBoxProps): string =>
  renderHtml(<GlanceBox {...props} />);
