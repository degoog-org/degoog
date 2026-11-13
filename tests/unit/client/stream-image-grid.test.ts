import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ScoredResult } from "../../../src/shared/search-types";
import { FakeElement, parseHtml, type FakeNode } from "../../helpers/fake-dom";

const CARD_HEIGHT = 100;
const IMAGE_CARD_TEMPLATE =
  '<img class="image-thumb" src="{{ thumbnail_url }}" alt="{{ title }}"><span class="image-source">{{ hostname }}</span>';
const SOURCES_CARD_TEMPLATE =
  '<span class="lg-result-sources" hidden>{{#each sources}}{{ . }}|{{/each sources}}</span>' +
  '<div class="image-thumb-wrap"><img class="image-thumb" src="{{ thumbnail_url }}" data-fallback="{{ fallback_url }}" alt="{{ title }}"></div>' +
  '<span class="image-source">{{ hostname }}</span>';

class GridNode {
  parent: GridNode | null = null;
  children: GridNode[] = [];
  attrs = new Map<string, string>();
  dataset: Record<string, string> = {};
  style: Record<string, string> = { display: "" };
  text = "";
  raw = "";

  constructor(public tagName: string) {}

  get className(): string {
    return this.attrs.get("class") ?? "";
  }

  set className(value: string) {
    this.attrs.set("class", value);
  }

  get id(): string {
    return this.attrs.get("id") ?? "";
  }

  set id(value: string) {
    this.attrs.set("id", value);
  }

  get src(): string {
    return this.attrs.get("src") ?? "";
  }

  get textContent(): string {
    if (this.tagName === "#text") return this.text;
    return this.children.map((child) => child.textContent).join("");
  }

  get innerHTML(): string {
    return this.tagName === "template" ? this.raw : this.children.map(_serialize).join("");
  }

  set innerHTML(html: string) {
    if (this.tagName === "template") {
      this.raw = html;
      return;
    }
    this.replaceChildren();
    parseHtml(html).forEach((node) => this.appendChild(_fromFake(node)));
  }

  get classList() {
    const names = () => this.className.split(/\s+/).filter(Boolean);
    return {
      contains: (name: string) => names().includes(name),
      add: (name: string) => {
        if (!names().includes(name)) this.className = [...names(), name].join(" ");
      },
      remove: (name: string) => {
        this.className = names().filter((n) => n !== name).join(" ");
      },
    };
  }

  get clientWidth(): number {
    return 1200;
  }

  get offsetWidth(): number {
    return CARD_HEIGHT;
  }

  get offsetHeight(): number {
    return this.className === "image-column"
      ? this.children.length * CARD_HEIGHT
      : CARD_HEIGHT;
  }

  getBoundingClientRect() {
    const top = this.parent ? this.parent.children.indexOf(this) * CARD_HEIGHT : 0;
    return { top, bottom: top + CARD_HEIGHT, height: CARD_HEIGHT };
  }

  appendChild(node: GridNode): GridNode {
    node.remove();
    node.parent = this;
    this.children.push(node);
    return node;
  }

  remove(): void {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }

  replaceChildren(): void {
    [...this.children].forEach((child) => child.remove());
  }

  replaceWith(node: GridNode): void {
    const parent = this.parent;
    if (!parent) return;
    node.remove();
    parent.children.splice(parent.children.indexOf(this), 1, node);
    node.parent = parent;
    this.parent = null;
  }

  addEventListener(): void {}

  scrollIntoView(): void {}

  matches(selector: string): boolean {
    return selector.split(",").some((part) => {
      const [head, id] = part.trim().split("#");
      const [tag, ...classes] = head.split(".");
      return (
        (!tag || tag === this.tagName) &&
        (id === undefined || id === this.id) &&
        classes.every((name) => this.classList.contains(name))
      );
    });
  }

  querySelectorAll(selector: string): GridNode[] {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }

  querySelector(selector: string): GridNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

const _fromFake = (node: FakeNode): GridNode => {
  if (!(node instanceof FakeElement)) {
    const text = new GridNode("#text");
    text.text = (node as FakeNode & { nodeValue: string }).nodeValue;
    return text;
  }
  const el = new GridNode(node.tagName);
  node.attributes.forEach((value, name) => el.attrs.set(name, value));
  node.childNodes.forEach((child) => el.appendChild(_fromFake(child)));
  return el;
};

const _serialize = (node: GridNode): string => {
  if (node.tagName === "#text") return node.text;
  const attrs = [...node.attrs].map(([name, value]) => ` ${name}="${value}"`).join("");
  return `<${node.tagName}${attrs}>${node.innerHTML}</${node.tagName}>`;
};

const body = new GridNode("body");
const template = new GridNode("template");
const saved = {
  window: (globalThis as { window?: unknown }).window,
  document: (globalThis as { document?: unknown }).document,
  ResizeObserver: (globalThis as { ResizeObserver?: unknown }).ResizeObserver,
};

const fakeWindow = {
  innerHeight: 10_000,
  innerWidth: 1200,
  scopedT: () => (key: string) => key,
  addEventListener: () => {},
  dispatchEvent: () => true,
};

let streamImageGrid: (batch: ScoredResult[], container: HTMLElement) => ScoredResult[];

beforeAll(async () => {
  template.id = "degoog-image-card";
  template.innerHTML = IMAGE_CARD_TEMPLATE;
  body.appendChild(template);
  Object.assign(globalThis, {
    window: fakeWindow,
    document: {
      createElement: (tag: string) => new GridNode(tag),
      querySelector: (selector: string) => body.querySelector(selector),
      querySelectorAll: (selector: string) => body.querySelectorAll(selector),
    },
    ResizeObserver: class {
      observe(): void {}
      disconnect(): void {}
    },
  });
  ({ streamImageGrid } = await import(
    "../../../src/client/modules/renderer/media/render-media"
  ));
});

afterAll(() => {
  Object.assign(globalThis, saved);
});

const image = (
  url: string,
  thumbnail?: string,
  sources: string[] = ["A"],
): ScoredResult => ({
  title: url,
  url: `https://example.com/${url}`,
  snippet: "",
  source: sources[0],
  score: 1,
  sources,
  thumbnail,
});

const gridContainer = (): GridNode => {
  const container = new GridNode("div");
  const grid = new GridNode("div");
  grid.className = "image-grid";
  container.appendChild(grid);
  body.appendChild(container);
  return container;
};

const cardFor = (container: GridNode, url: string): GridNode | undefined =>
  container
    .querySelectorAll(".image-card")
    .find((card) => card.innerHTML.includes(`alt="${url}"`));

const streamInto = (container: GridNode) => (batch: ScoredResult[]) =>
  streamImageGrid(batch, container as unknown as HTMLElement);

describe("streamImageGrid", () => {
  test("refreshes a kept card when a later engine fills its thumbnail", () => {
    fakeWindow.innerHeight = 10_000;
    template.innerHTML = IMAGE_CARD_TEMPLATE;
    const container = gridContainer();
    const stream = streamInto(container);

    stream([image("a"), image("b", "https://cdn.example/b.jpg")]);
    const blank = cardFor(container, "a")!;
    const untouched = cardFor(container, "b")!;
    blank.style.display = "none";
    blank.classList.add("selected");

    stream([
      image("b", "https://cdn.example/b.jpg"),
      image("a", "https://cdn.example/a.jpg"),
    ]);

    expect(cardFor(container, "a")).toBe(blank);
    expect(blank.innerHTML).toContain('src="https://cdn.example/a.jpg"');
    expect(blank.style.display).toBe("");
    expect(blank.classList.contains("selected")).toBe(true);
    expect(cardFor(container, "b")).toBe(untouched);
    expect(container.querySelectorAll(".image-card")).toHaveLength(2);
  });

  test("refreshes a reused card below the fold when a later engine fills its thumbnail", () => {
    fakeWindow.innerHeight = CARD_HEIGHT / 2;
    template.innerHTML = IMAGE_CARD_TEMPLATE;
    const container = gridContainer();
    const stream = streamInto(container);
    const above = ["a", "b", "c", "d", "e"].map((url) =>
      image(url, `https://cdn.example/${url}.jpg`),
    );

    stream([...above, image("f")]);
    const below = cardFor(container, "f")!;
    const kept = above.map((r) => cardFor(container, r.title)!);

    stream([image("f", "https://cdn.example/f.jpg"), ...above]);

    expect(cardFor(container, "f")).toBe(below);
    expect(below.innerHTML).toContain('src="https://cdn.example/f.jpg"');
    expect(above.map((r) => cardFor(container, r.title))).toEqual(kept);
    expect(container.querySelectorAll(".image-card")).toHaveLength(6);
  });

  test("keeps a loaded thumbnail when a later engine only adds a source", () => {
    fakeWindow.innerHeight = 10_000;
    template.innerHTML = SOURCES_CARD_TEMPLATE;
    const container = gridContainer();
    const stream = streamInto(container);
    const thumb = (url: string) => `https://cdn.example/${url}.jpg`;

    stream([image("a", thumb("a")), image("c", thumb("c"))]);
    const card = cardFor(container, "a")!;
    const wrap = card.querySelector(".image-thumb-wrap")!;
    const img = card.querySelector("img.image-thumb")!;
    const hidden = cardFor(container, "c")!;
    wrap.classList.add("loaded");
    hidden.style.display = "none";

    stream([
      image("a", thumb("a"), ["A", "B"]),
      image("c", thumb("c"), ["A", "B"]),
    ]);

    expect(cardFor(container, "a")).toBe(card);
    expect(card.querySelector(".image-thumb-wrap")).toBe(wrap);
    expect(card.querySelector("img.image-thumb")).toBe(img);
    expect(img.src).toBe(thumb("a"));
    expect(wrap.classList.contains("loaded")).toBe(true);
    expect(card.querySelector(".lg-result-sources")!.textContent).toBe("A|B|");
    expect(hidden.querySelector(".lg-result-sources")!.textContent).toBe("A|B|");
    expect(hidden.style.display).toBe("none");
  });
});
