import type {
  Child,
  Component,
  ElementNode,
  FragmentNode,
  Props,
  VNode,
} from "./tribute/types";

export const FRAGMENT_TAG = "#frag";

export const Fragment = (props: { children?: Child }): FragmentNode => ({
  k: "frag",
  children: normalizeChildren(props.children),
});

export const normalizeChildren = (child: Child): VNode[] => {
  const out: VNode[] = [];
  _pushChild(out, child);
  return out;
};

const _pushChild = (out: VNode[], child: Child): void => {
  if (child == null || child === true || child === false) return;
  if (Array.isArray(child)) {
    for (const each of child) _pushChild(out, each);
    return;
  }
  if (typeof child === "string") {
    if (child !== "") out.push({ k: "text", value: child });
    return;
  }
  if (typeof child === "number") {
    out.push({ k: "text", value: String(child) });
    return;
  }
  out.push(child);
};

export const jsx = (
  tag: string | Component<Props>,
  props: Props,
  key?: string | number,
): VNode => {
  if (typeof tag === "function") {
    const rendered = tag(props);
    if (key !== undefined && rendered.k !== "text" && rendered.k !== "raw") {
      rendered.key = String(key);
    }
    return rendered;
  }

  if (tag === FRAGMENT_TAG) {
    return {
      k: "frag",
      children: normalizeChildren(props.children as Child),
      ...(key !== undefined ? { key: String(key) } : {}),
    };
  }

  const { children, static: isStatic, ...rest } = props;
  const node: ElementNode = {
    k: "el",
    tag,
    props: rest as Props,
    children: normalizeChildren(children as Child),
  };
  if (isStatic === true) node.static = true;
  if (key !== undefined) node.key = String(key);
  return node;
};

export const jsxs = jsx;

type EventHandler = (event: Event) => void;

type Attr<T> = T | null | undefined;

interface BaseAttributes {
  key?: Attr<string | number>;
  children?: Child;
  static?: Attr<boolean>;
  class?: Attr<string>;
  id?: Attr<string>;
  style?: Attr<string>;
  title?: Attr<string>;
  role?: Attr<string>;
  hidden?: Attr<boolean>;
  tabindex?: Attr<number | string>;
}

type EventAttributes = {
  [K in `on${Capitalize<string>}`]?: EventHandler;
};

type DataAttributes = {
  [K in `data-${string}`]?: string | number | boolean | null | undefined;
};

type AriaAttributes = {
  [K in `aria-${string}`]?: string | number | boolean | null | undefined;
};

export type HtmlAttributes = BaseAttributes &
  EventAttributes &
  DataAttributes &
  AriaAttributes & {
    [attribute: string]:
      | string
      | number
      | boolean
      | null
      | undefined
      | Child
      | EventHandler;
  };

export namespace JSX {
  export type Element = VNode;
  /** Props allowed on every JSX element, components included. */
  export interface IntrinsicAttributes {
    key?: string | number;
  }
  export interface ElementChildrenAttribute {
    children: Child;
  }
  export interface IntrinsicElements {
    [tag: string]: HtmlAttributes;
  }
}
