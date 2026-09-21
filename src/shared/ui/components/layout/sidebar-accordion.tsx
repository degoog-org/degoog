import { Chevron } from "./chevron";
import type { Child } from "../../core/types";

export const SIDEBAR_ACCORDION_CLASS =
  "sidebar-panel sidebar-accordion degoog-panel degoog-panel--accordion degoog-panel--stack-item";
export const SIDEBAR_TOGGLE_CLASS =
  "sidebar-accordion-toggle degoog-accordion-toggle degoog-accordion-toggle--sidebar";
export const SIDEBAR_BODY_CLASS = "sidebar-accordion-body degoog-accordion-body";

export interface AccordionProps {
  title: string;
  class?: string;
  children?: Child;
}

export const SidebarAccordion = ({ title, class: extra, children }: AccordionProps): JSX.Element => (
  <div class={extra ? `sidebar-panel sidebar-accordion ${extra} degoog-panel degoog-panel--accordion degoog-panel--stack-item` : SIDEBAR_ACCORDION_CLASS}>
    <button class={SIDEBAR_TOGGLE_CLASS} type="button">
      <span>{title}</span>
      <Chevron />
    </button>
    <div class={SIDEBAR_BODY_CLASS}>{children}</div>
  </div>
);
