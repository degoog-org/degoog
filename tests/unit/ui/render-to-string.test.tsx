import { describe, expect, test } from "bun:test";
import { renderHtml } from "../../../src/shared/ui/core/html";
import { Raw } from "../../../src/shared/ui/core/raw";

describe("renderHtml", () => {
  test.each([
    ["&", "&amp;"],
    ["<", "&lt;"],
    [">", "&gt;"],
    ["\u00a0", "&nbsp;"],
  ])("escapes %p in text", (input, expected) => {
    expect(renderHtml(<p>{input}</p>)).toBe(`<p>${expected}</p>`);
  });

  test.each([
    ['"', "&quot;"],
    ["'", "&#39;"],
    ["<", "&lt;"],
  ])("escapes %p in attributes", (input, expected) => {
    expect(renderHtml(<a title={input} />)).toBe(`<a title="${expected}"></a>`);
  });

  test("drops event handlers, because nojs runs under script-src 'none'", () => {
    const html = renderHtml(<button onClick={() => {}}>go</button>);
    expect(html).toBe("<button>go</button>");
  });

  test("void tags self-close and boolean props collapse", () => {
    expect(renderHtml(<img src="/a.png" />)).toBe('<img src="/a.png">');
    expect(renderHtml(<input disabled={true} />)).toBe("<input disabled>");
    expect(renderHtml(<input disabled={false} />)).toBe("<input>");
  });

  test.each([null, undefined, false, ""])("skips %p children", (value) => {
    expect(renderHtml(<div>{value}</div>)).toBe("<div></div>");
  });

  test.each([null, undefined, false])("drops %p attributes", (value) => {
    expect(renderHtml(<div title={value as undefined} />)).toBe("<div></div>");
  });

  test("Raw passes trusted html through unescaped", () => {
    expect(renderHtml(<Raw html={'<b class="x">&</b>'} />)).toBe('<b class="x">&</b>');
  });

  test("key and static are structural, never attributes", () => {
    expect(renderHtml(<div key="a" static={true} id="x" />)).toBe('<div id="x"></div>');
  });
});
