const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

export class FakeNode {
  parentNode: FakeElement | null = null;
  childNodes: FakeNode[] = [];

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }

  get nextSibling(): FakeNode | null {
    const siblings = this.parentNode?.childNodes;
    if (!siblings) return null;
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }

  insertBefore(node: FakeNode, anchor: FakeNode | null): FakeNode {
    node.parentNode?.removeChild(node);
    const at = anchor ? this.childNodes.indexOf(anchor) : -1;
    if (at < 0) this.childNodes.push(node);
    else this.childNodes.splice(at, 0, node);
    node.parentNode = this as unknown as FakeElement;
    return node;
  }

  appendChild(node: FakeNode): FakeNode {
    return this.insertBefore(node, null);
  }

  removeChild(node: FakeNode): FakeNode {
    const at = this.childNodes.indexOf(node);
    if (at >= 0) this.childNodes.splice(at, 1);
    node.parentNode = null;
    return node;
  }
}

export class FakeText extends FakeNode {
  nodeValue: string;
  constructor(value: string) {
    super();
    this.nodeValue = value;
  }
}

export class FakeElement extends FakeNode {
  tagName: string;
  attributes = new Map<string, string>();
  listeners: Array<{ type: string; fn: (event: unknown) => void }> = [];
  content?: FakeElement;

  constructor(tag: string) {
    super();
    this.tagName = tag.toLowerCase();
    if (this.tagName === "template") this.content = new FakeElement("#fragment");
    if (["input", "textarea", "select"].includes(this.tagName)) {
      (this as unknown as { value: string }).value = "";
      (this as unknown as { checked: boolean }).checked = false;
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(type: string, fn: (event: unknown) => void): void {
    this.listeners.push({ type, fn });
  }

  removeEventListener(type: string, fn: (event: unknown) => void): void {
    const at = this.listeners.findIndex((l) => l.type === type && l.fn === fn);
    if (at >= 0) this.listeners.splice(at, 1);
  }

  dispatch(type: string, event: unknown = {}): void {
    for (const listener of [...this.listeners]) {
      if (listener.type === type) listener.fn(event);
    }
  }

  replaceChildren(...nodes: FakeNode[]): void {
    for (const node of [...this.childNodes]) this.removeChild(node);
    for (const node of nodes) this.appendChild(node);
  }

  set innerHTML(html: string) {
    const target = this.content ?? this;
    target.replaceChildren();
    for (const node of parseHtml(html)) target.appendChild(node);
  }
}

const ATTR_RE = /([:@a-zA-Z_][-.:\w]*)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)')?/g;

export const parseHtml = (html: string): FakeNode[] => {
  const roots: FakeNode[] = [];
  const stack: FakeElement[] = [];
  const push = (node: FakeNode): void => {
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].appendChild(node);
  };

  let at = 0;
  while (at < html.length) {
    const open = html.indexOf("<", at);
    if (open < 0) {
      const tail = html.slice(at);
      if (tail) push(new FakeText(tail));
      break;
    }
    if (open > at) push(new FakeText(html.slice(at, open)));

    const close = html.indexOf(">", open);
    if (close < 0) break;
    const inner = html.slice(open + 1, close);

    if (inner.startsWith("/")) {
      stack.pop();
      at = close + 1;
      continue;
    }

    const selfClosing = inner.endsWith("/");
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const space = body.search(/\s/);
    const tag = (space < 0 ? body : body.slice(0, space)).trim();
    const element = new FakeElement(tag);

    if (space >= 0) {
      const attrs = body.slice(space);
      ATTR_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = ATTR_RE.exec(attrs)) !== null) {
        element.setAttribute(match[1], match[2] ?? match[3] ?? "");
      }
    }

    push(element);
    if (!selfClosing && !VOID_TAGS.has(element.tagName)) stack.push(element);
    at = close + 1;
  }

  return roots;
};

export const serialize = (node: FakeNode): string => {
  if (node instanceof FakeText) return node.nodeValue;
  const el = node as FakeElement;
  let attrs = "";
  for (const [name, value] of el.attributes) {
    attrs += value === "" ? ` ${name}` : ` ${name}="${value}"`;
  }
  const inner = el.childNodes.map(serialize).join("");
  if (VOID_TAGS.has(el.tagName)) return `<${el.tagName}${attrs}>`;
  return `<${el.tagName}${attrs}>${inner}</${el.tagName}>`;
};

export const innerHtmlOf = (el: FakeElement): string =>
  el.childNodes.map(serialize).join("");

export const installFakeDom = (): (() => void) => {
  const saved = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string): FakeElement => new FakeElement(tag),
    createTextNode: (value: string): FakeText => new FakeText(value),
  };
  return (): void => {
    (globalThis as { document?: unknown }).document = saved;
  };
};
