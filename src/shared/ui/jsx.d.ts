import type { Child, VNode } from "./tribute/types";
import type { HtmlAttributes } from "./jsx-runtime";

declare global {
  namespace JSX {
    type Element = VNode;
    interface IntrinsicAttributes {
      key?: string | number;
    }
    interface ElementChildrenAttribute {
      children: Child;
    }
    interface IntrinsicElements {
      [tag: string]: HtmlAttributes;
    }
  }
}

export {};
