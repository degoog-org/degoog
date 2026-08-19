import { describe, test, expect, afterAll } from "bun:test";
import { renderTemplate } from "../../src/client/utils/template";

const savedDocument = (globalThis as { document?: unknown }).document;

const fakeElement = (): { textContent: string; innerHTML: string } => {
  let text = "";
  return {
    set textContent(value: string) {
      text = value;
    },
    get textContent() {
      return text;
    },
    get innerHTML() {
      return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    },
  };
};

const withTemplate = <T>(html: string, fn: () => T): T => {
  (globalThis as { document?: unknown }).document = {
    querySelectorAll: () => [{ innerHTML: html }],
    createElement: fakeElement,
  };
  try {
    return fn();
  } finally {
    (globalThis as { document?: unknown }).document = savedDocument;
  }
};

afterAll(() => {
  (globalThis as { document?: unknown }).document = savedDocument;
});

describe("public/template each blocks", () => {
  test("keeps indexed access for array items", () => {
    const html = withTemplate(
      "{{#each rows}}<i>{{0}}={{1}}</i>{{/each rows}}",
      () => renderTemplate("row", { rows: [["a", "1"], ["b", "2"]] }),
    );
    expect(html).toBe("<i>a=1</i><i>b=2</i>");
  });

  test("keeps parent context, dot and index alongside array items", () => {
    const html = withTemplate(
      "{{#each rows}}<i>{{label}}:{{@index}}:{{0}}</i>{{/each rows}}",
      () => renderTemplate("row", { label: "row", rows: [["a"], ["b"]] }),
    );
    expect(html).toBe("<i>row:0:a</i><i>row:1:b</i>");
  });

  test("keeps object item properties and scalar dot access", () => {
    const objects = withTemplate(
      "{{#each items}}<i>{{name}}</i>{{/each items}}",
      () => renderTemplate("row", { items: [{ name: "one" }, { name: "two" }] }),
    );
    expect(objects).toBe("<i>one</i><i>two</i>");

    const scalars = withTemplate(
      "{{#each items}}<i>{{.}}</i>{{/each items}}",
      () => renderTemplate("row", { items: ["one", "two"] }),
    );
    expect(scalars).toBe("<i>one</i><i>two</i>");
  });
});
