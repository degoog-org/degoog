import { Chevron } from "../../shared/ui/components/layout/chevron";
import {
  SIDEBAR_BODY_CLASS,
  SIDEBAR_TOGGLE_CLASS,
} from "../../shared/ui/components/layout/sidebar-accordion";
import type { Child } from "../../shared/ui/core/types";

export interface NojsAccordionProps {
  class: string;
  title: string;
  slot?: string;
  children?: Child;
}

export const NojsAccordion = ({
  class: className,
  title,
  slot,
  children,
}: NojsAccordionProps): JSX.Element => (
  <details class={className} data-slot={slot} open={true}>
    <summary class={SIDEBAR_TOGGLE_CLASS}>
      <span>{title}</span>
      <Chevron />
    </summary>
    <div class={SIDEBAR_BODY_CLASS}>{children}</div>
  </details>
);
