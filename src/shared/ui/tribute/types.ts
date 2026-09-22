export type VNode =
  | ElementNode
  | TextNode
  | RawNode
  | FragmentNode;

export interface ElementNode {
  k: "el";
  tag: string;
  props: Props;
  children: VNode[];
  key?: string;
  /** Render once, then never diff or replace. Plugin-owned subtrees. */
  static?: boolean;
}

export interface TextNode {
  k: "text";
  value: string;
}

/** Pre-rendered trusted HTML. Never escaped, never diffed. */
export interface RawNode {
  k: "raw";
  html: string;
}

export interface FragmentNode {
  k: "frag";
  children: VNode[];
  key?: string;
}

export type EventHandler = (event: Event) => void;

export type PropValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | EventHandler;

export type Props = Record<string, PropValue | Child | Child[]>;

export type Child =
  | VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | Child[];

export type Component<P = Record<string, unknown>> = (props: P) => VNode;

export type Tag = string | Component<never>;
