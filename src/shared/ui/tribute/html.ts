import { escapeAttribute, escapeHtml } from "./escape";
import type { Props, VNode } from "./types";

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const SKIPPED_PROPS = new Set(["key", "static", "children"]);

const _isEventProp = (name: string): boolean =>
  name.length > 2 && name.startsWith("on") && name[2] === name[2].toUpperCase();

const _attributes = (props: Props): string => {
  let out = "";
  for (const name of Object.keys(props)) {
    if (SKIPPED_PROPS.has(name)) continue;
    if (_isEventProp(name)) continue;

    const value = props[name];
    if (value == null || value === false) continue;
    if (value === true) {
      out += ` ${name}`;
      continue;
    }
    if (typeof value === "function") continue;
    out += ` ${name}="${escapeAttribute(String(value))}"`;
  }
  return out;
};

export const renderHtml = (node: VNode | VNode[]): string => {
  if (Array.isArray(node)) return node.map(renderHtml).join("");

  switch (node.k) {
    case "text":
      return escapeHtml(node.value);
    case "raw":
      return node.html;
    case "frag":
      return node.children.map(renderHtml).join("");
    case "el": {
      const attrs = _attributes(node.props);
      if (VOID_TAGS.has(node.tag)) return `<${node.tag}${attrs}>`;
      const inner = node.children.map(renderHtml).join("");
      return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
    }
  }
};
