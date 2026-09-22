export { Fragment, jsx, jsxs, normalizeChildren } from "./jsx-runtime";

export { escapeAttribute, escapeHtml } from "./core/escape";
export { renderHtml } from "./core/html";
export { append, clear, render } from "./core/dom";
export { Raw, raw } from "./core/raw";
export type {
  Child,
  Component,
  ElementNode,
  EventHandler,
  FragmentNode,
  Props,
  RawNode,
  TextNode,
  VNode,
} from "./core/types";

export * from "./components";
