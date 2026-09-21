import { effect } from "../state/signal";
import type {
  ElementNode,
  EventHandler,
  Props,
  RawNode,
  TextNode,
  VNode,
} from "./types";

type Concrete = ElementNode | TextNode | RawNode;

interface Instance {
  vnode: Concrete;
  nodes: Node[];
  children?: Instance[];
  handlers?: Map<string, EventListener>;
}

const SKIPPED_PROPS = new Set(["key", "static", "children"]);

const _isEventProp = (name: string): boolean =>
  name.length > 2 && name.startsWith("on") && name[2] === name[2].toUpperCase();

const _eventName = (prop: string): string => prop.slice(2).toLowerCase();

const _flatten = (nodes: VNode[]): Concrete[] => {
  const out: Concrete[] = [];
  const walk = (list: VNode[]): void => {
    for (const node of list) {
      if (node.k === "frag") walk(node.children);
      else out.push(node);
    }
  };
  walk(nodes);
  return out;
};

const _setAttribute = (el: Element, name: string, value: unknown): void => {
  if (value == null || value === false) {
    el.removeAttribute(name);
    return;
  }
  el.setAttribute(name, value === true ? "" : String(value));
};

const _applyProps = (
  el: Element,
  oldProps: Props,
  newProps: Props,
  handlers: Map<string, EventListener>,
): void => {
  for (const name of Object.keys(oldProps)) {
    if (SKIPPED_PROPS.has(name)) continue;
    if (name in newProps) continue;
    if (_isEventProp(name)) {
      const event = _eventName(name);
      const existing = handlers.get(event);
      if (existing) {
        el.removeEventListener(event, existing);
        handlers.delete(event);
      }
      continue;
    }
    el.removeAttribute(name);
  }

  for (const name of Object.keys(newProps)) {
    if (SKIPPED_PROPS.has(name)) continue;
    const value = newProps[name];

    if (_isEventProp(name)) {
      const event = _eventName(name);
      const existing = handlers.get(event);
      const next = typeof value === "function" ? (value as EventHandler) : null;
      if (existing === next) continue;
      if (existing) el.removeEventListener(event, existing);
      if (next) {
        el.addEventListener(event, next);
        handlers.set(event, next);
      } else {
        handlers.delete(event);
      }
      continue;
    }

    if (Object.is(oldProps[name], value)) continue;
    _setAttribute(el, name, value);

    if (name === "value" && "value" in el) {
      (el as HTMLInputElement).value = value == null ? "" : String(value);
    }
    if (name === "checked" && "checked" in el) {
      (el as HTMLInputElement).checked = Boolean(value);
    }
  }
};

const _rawNodes = (html: string): Node[] => {
  const template = document.createElement("template");
  template.innerHTML = html;
  return [...template.content.childNodes];
};

const _create = (vnode: Concrete): Instance => {
  if (vnode.k === "text") {
    return { vnode, nodes: [document.createTextNode(vnode.value)] };
  }
  if (vnode.k === "raw") {
    return { vnode, nodes: _rawNodes(vnode.html) };
  }
  const el = document.createElement(vnode.tag);
  const handlers = new Map<string, EventListener>();
  _applyProps(el, {}, vnode.props, handlers);
  const children = _patchChildren(el, [], _flatten(vnode.children));
  return { vnode, nodes: [el], children, handlers };
};

const _reusable = (instance: Instance, next: Concrete): boolean => {
  const previous = instance.vnode;
  if (previous.k !== next.k) return false;
  const previousKey = previous.k === "text" || previous.k === "raw" ? undefined : previous.key;
  const nextKey = next.k === "text" || next.k === "raw" ? undefined : next.key;
  if (previousKey !== nextKey) return false;
  if (previous.k === "el" && next.k === "el") return previous.tag === next.tag;
  return true;
};

const _patch = (instance: Instance, next: Concrete): Instance => {
  const previous = instance.vnode;

  if (next.k === "text" && previous.k === "text") {
    if (previous.value !== next.value) {
      (instance.nodes[0] as Text).nodeValue = next.value;
    }
    instance.vnode = next;
    return instance;
  }

  if (next.k === "raw" && previous.k === "raw") {
    if (previous.html === next.html) {
      instance.vnode = next;
      return instance;
    }
    return _create(next);
  }

  const el = instance.nodes[0] as Element;
  const nextEl = next as ElementNode;
  const previousEl = previous as ElementNode;

  if (previousEl.static || nextEl.static) {
    instance.vnode = next;
    return instance;
  }

  _applyProps(el, previousEl.props, nextEl.props, instance.handlers ?? new Map());
  instance.children = _patchChildren(
    el,
    instance.children ?? [],
    _flatten(nextEl.children),
  );
  instance.vnode = next;
  return instance;
};

function _patchChildren(
  parent: Element,
  previous: Instance[],
  next: Concrete[],
): Instance[] {
  const keyed = new Map<string, Instance>();
  const loose: Instance[] = [];
  for (const instance of previous) {
    const vnode = instance.vnode;
    const key = vnode.k === "el" ? vnode.key : undefined;
    if (key !== undefined) keyed.set(key, instance);
    else loose.push(instance);
  }

  const used = new Set<Instance>();
  const result: Instance[] = [];
  let cursor = 0;

  for (const vnode of next) {
    const key = vnode.k === "el" ? vnode.key : undefined;
    let candidate: Instance | undefined;

    if (key !== undefined) {
      candidate = keyed.get(key);
    } else {
      while (cursor < loose.length) {
        const option = loose[cursor++];
        if (used.has(option)) continue;
        candidate = option;
        break;
      }
    }

    if (candidate && !used.has(candidate) && _reusable(candidate, vnode)) {
      used.add(candidate);
      result.push(_patch(candidate, vnode));
    } else {
      result.push(_create(vnode));
    }
  }

  const owned = new Set<Node>();
  for (const instance of result) for (const node of instance.nodes) owned.add(node);

  for (const instance of previous) {
    if (used.has(instance)) continue;
    for (const node of instance.nodes) {
      if (!owned.has(node) && node.parentNode === parent) parent.removeChild(node);
    }
  }

  let anchor: Node | null = parent.firstChild;
  for (const instance of result) {
    for (const node of instance.nodes) {
      if (node === anchor) {
        anchor = anchor.nextSibling;
        continue;
      }
      parent.insertBefore(node, anchor);
    }
  }

  while (anchor) {
    const following: Node | null = anchor.nextSibling;
    if (!owned.has(anchor)) parent.removeChild(anchor);
    anchor = following;
  }

  return result;
}

const _roots = new WeakMap<Element, Instance[]>();

/** Diff `node` into `container`, reusing whatever a previous render left there. */
export const render = (node: VNode | VNode[], container: Element): void => {
  const next = _flatten(Array.isArray(node) ? node : [node]);
  const previous = _roots.get(container) ?? [];
  _roots.set(container, _patchChildren(container, previous, next));
};

/**
 * Render `view` into `container` and re-render whenever a signal it read
 * changes. Returns a dispose function.
 */
export const mount = (view: () => VNode, container: Element): (() => void) =>
  effect(() => {
    render(view(), container);
  });
