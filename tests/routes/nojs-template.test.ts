import { describe, test, expect } from "bun:test";
import { renderTemplateString } from "../../src/server/nojs/template";
import {
  addClassById,
  addClassWhereClass,
  appendToId,
  fillById,
  insertBeforeHeadEnd,
  removeElementById,
  replaceElementById,
  sanitizeTemplate,
  setAttributesByClass,
  setAttributesById,
  wrapElementById,
} from "../../src/server/nojs/dom";
import { loadNojsTemplate } from "../../src/server/nojs/templates";
import { prefixRootRelativeUrls } from "../../src/server/nojs/render";

describe("nojs renderTemplateString", () => {
  test("fills plain placeholders", () => {
    expect(renderTemplateString("<p>{{ title }}</p>", { title: "Hello" })).toBe(
      "<p>Hello</p>",
    );
  });

  test("resolves dotted paths", () => {
    expect(
      renderTemplateString("{{ result.url }}", { result: { url: "/x" } }),
    ).toBe("/x");
  });

  test("renders missing keys as empty", () => {
    expect(renderTemplateString("[{{ nope }}]", {})).toBe("[]");
    expect(renderTemplateString("[{{ a.b.c }}]", { a: null })).toBe("[]");
  });

  test("escapes html and quote characters", () => {
    expect(renderTemplateString("{{ v }}", { v: `<script>&"'</script>` })).toBe(
      "&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;",
    );
  });

  test("escapes non breaking spaces", () => {
    expect(renderTemplateString("{{ v }}", { v: "a\u00a0b" })).toBe("a&nbsp;b");
  });

  test("stringifies non string values", () => {
    expect(renderTemplateString("{{ n }}/{{ b }}", { n: 0, b: false })).toBe(
      "0/false",
    );
  });

  test("renders #if for truthy values only", () => {
    const tpl = "{{#if show}}yes{{/if show}}";
    expect(renderTemplateString(tpl, { show: true })).toBe("yes");
    expect(renderTemplateString(tpl, { show: false })).toBe("");
    expect(renderTemplateString(tpl, {})).toBe("");
  });

  test("treats empty arrays as falsy", () => {
    const tpl = "{{#if items}}has{{/if items}}{{^if items}}none{{/if items}}";
    expect(renderTemplateString(tpl, { items: [] })).toBe("none");
    expect(renderTemplateString(tpl, { items: [1] })).toBe("has");
  });

  test("renders ^if for falsy values only", () => {
    const tpl = "{{^if error}}ok{{/if error}}";
    expect(renderTemplateString(tpl, { error: "" })).toBe("ok");
    expect(renderTemplateString(tpl, { error: "boom" })).toBe("");
  });

  test("renders #each over objects", () => {
    const tpl = "{{#each items}}<li>{{ name }}</li>{{/each items}}";
    expect(
      renderTemplateString(tpl, { items: [{ name: "a" }, { name: "b" }] }),
    ).toBe("<li>a</li><li>b</li>");
  });

  test("exposes @index and . inside #each", () => {
    const tpl = "{{#each xs}}{{ @index }}:{{ . }};{{/each xs}}";
    expect(renderTemplateString(tpl, { xs: ["a", "b"] })).toBe("0:a;1:b;");
  });

  test("keeps outer context inside #each", () => {
    const tpl = "{{#each xs}}{{ prefix }}{{ . }}{{/each xs}}";
    expect(renderTemplateString(tpl, { prefix: "-", xs: ["a"] })).toBe("-a");
  });

  test("renders nothing for a non array #each value", () => {
    expect(
      renderTemplateString("{{#each xs}}x{{/each xs}}", { xs: "nope" }),
    ).toBe("");
  });

  test("renders nested blocks", () => {
    const tpl =
      "{{#if outer}}{{#each items}}{{#if ok}}[{{ name }}]{{/if ok}}{{/each items}}{{/if outer}}";
    expect(
      renderTemplateString(tpl, {
        outer: true,
        items: [
          { name: "a", ok: true },
          { name: "b", ok: false },
        ],
      }),
    ).toBe("[a]");
  });

  test("escapes values rendered inside each", () => {
    const tpl = `{{#each xs}}<a title="{{ . }}"></a>{{/each xs}}`;
    expect(renderTemplateString(tpl, { xs: [`"x"`] })).toBe(
      `<a title="&quot;x&quot;"></a>`,
    );
  });

  test("leaves templates without placeholders untouched", () => {
    expect(renderTemplateString("<p>static</p>", {})).toBe("<p>static</p>");
  });
});

describe("nojs shell filling", () => {
  test("fills the inner content of an empty container by id", () => {
    expect(fillById('<div id="a"></div>', "a", "<p>x</p>")).toBe(
      '<div id="a"><p>x</p></div>',
    );
  });

  test("replaces the existing inner content, nested tags and all", () => {
    expect(
      fillById('<div id="a"><div id="b">old</div></div>', "a", "new"),
    ).toBe('<div id="a">new</div>');
  });

  test("keeps other attributes on the container", () => {
    expect(fillById('<div id="a" class="c"></div>', "a", "x")).toBe(
      '<div id="a" class="c">x</div>',
    );
  });

  test("leaves the html alone when the id is absent", () => {
    expect(fillById('<div id="a"></div>', "nope", "x")).toBe(
      '<div id="a"></div>',
    );
  });

  test("is safe against dollar sequences in the replacement", () => {
    const value = "$& $` $' $1 $$";
    expect(fillById('<div id="a"></div>', "a", value)).toBe(
      `<div id="a">${value}</div>`,
    );
  });

  test("replaces a whole element by id", () => {
    expect(
      replaceElementById('<main><div id="a">x</div></main>', "a", "<b>y</b>"),
    ).toBe("<main><b>y</b></main>");
  });

  test("removes an element by id", () => {
    expect(
      removeElementById('<div><button id="go">x</button></div>', "go"),
    ).toBe("<div></div>");
  });

  test("wraps an element by id", () => {
    expect(
      wrapElementById('<div id="a">x</div>', "a", "<form>", "</form>"),
    ).toBe('<form><div id="a">x</div></form>');
  });

  test("appends to a container without losing what is there", () => {
    expect(appendToId('<div id="a"><p>1</p></div>', "a", "<p>2</p>")).toBe(
      '<div id="a"><p>1</p><p>2</p></div>',
    );
  });

  test("adds a class to a container that has none", () => {
    expect(addClassById('<div id="a"></div>', "a", "m")).toBe(
      '<div id="a" class="m"></div>',
    );
  });

  test("adds a class alongside the existing ones", () => {
    expect(addClassById('<div id="a" class="x y"></div>', "a", "m")).toBe(
      '<div id="a" class="x y m"></div>',
    );
  });

  test("sets attributes on a void element and drops the self closing slash", () => {
    expect(
      setAttributesById('<input id="q" type="text" />', "q", {
        name: "q",
        value: "hello",
      }),
    ).toBe('<input id="q" type="text" name="q" value="hello">');
  });

  test("replaces an attribute rather than duplicating it", () => {
    expect(
      setAttributesById(
        '<form id="f" action="/search" method="get"></form>',
        "f",
        {
          action: "/nojs/search",
          method: "post",
        },
      ),
    ).toBe('<form id="f" action="/nojs/search" method="post"></form>');
  });

  test("sets attributes on the first element carrying a class", () => {
    expect(
      setAttributesByClass(
        '<a href="/" class="results-logo">d</a>',
        "results-logo",
        {
          href: "/nojs",
        },
      ),
    ).toBe('<a class="results-logo" href="/nojs">d</a>');
  });

  test("adds a class to every element already carrying another", () => {
    expect(
      addClassWhereClass(
        '<span class="logo-d logo-letter">d</span><span class="other">x</span>',
        "logo-letter",
        "nojs-logo-letter",
      ),
    ).toBe(
      '<span class="logo-d logo-letter nojs-logo-letter">d</span><span class="other">x</span>',
    );
  });

  test("never adds the same class twice", () => {
    const html = '<span class="logo-letter nojs-logo-letter">d</span>';
    expect(addClassWhereClass(html, "logo-letter", "nojs-logo-letter")).toBe(
      html,
    );
  });

  test("inserts stylesheets before the closing head tag", () => {
    expect(insertBeforeHeadEnd("<head><title>x</title></head>", "<link>")).toBe(
      "<head><title>x</title><link></head>",
    );
  });
});

describe("nojs template sanitising", () => {
  test("strips script blocks and their contents", () => {
    expect(
      sanitizeTemplate('<p>a</p><script>var t = "</p>";</script><p>b</p>'),
    ).toBe("<p>a</p><p>b</p>");
  });

  test("strips a module script tag", () => {
    expect(
      sanitizeTemplate(
        '<body><script type="module" src="/app.js"></script></body>',
      ),
    ).toBe("<body></body>");
  });

  test("strips inline event handlers in either quote style", () => {
    expect(
      sanitizeTemplate(
        `<i onmouseenter="this.classList.add('x')" onmouseleave='y()' class="i"></i>`,
      ),
    ).toBe('<i class="i"></i>');
  });

  test("strips an unquoted inline handler", () => {
    expect(sanitizeTemplate("<img src=x onerror=alert(1) />")).toBe(
      "<img src=x />",
    );
  });

  test("strips module preload links", () => {
    expect(
      sanitizeTemplate(
        '<link rel="modulepreload" href="/public/app.js" /><title>x</title>',
      ),
    ).toBe("<title>x</title>");
  });

  test("leaves ordinary markup untouched", () => {
    const html = '<div class="a" data-tooltip="on the house">x</div>';
    expect(sanitizeTemplate(html)).toBe(html);
  });
});

describe("the nojs template chain", () => {
  test("serves the nojs override for a name that has one", async () => {
    const html = await loadNojsTemplate("logo");
    expect(html).toContain("\u{1D68D}");
    expect(html).toContain("logo-letter");
  });

  test("inherits the theme template for a name with no override", async () => {
    const html = (await loadNojsTemplate("result")) ?? "";
    expect(html).toContain("result-favicon degoog-result--favicon");
    expect(html).toContain("show_actions");
    expect(html).toContain("degoog-result--video-play");
    expect(html).not.toContain("onerror");
  });

  test("inherits the theme page shells", async () => {
    expect(await loadNojsTemplate("index")).toContain('id="home-search"');
    expect(await loadNojsTemplate("search")).toContain(
      'id="slot-above-sidebar"',
    );
    expect(await loadNojsTemplate("layout")).not.toContain("<script");
  });

  test("refuses a name that is not a safe file name", async () => {
    expect(await loadNojsTemplate("../layout")).toBeNull();
  });

  test("returns null for a name no theme registers", async () => {
    expect(await loadNojsTemplate("not-a-template")).toBeNull();
  });
});

describe("base path rewriting", () => {
  const link = (href: string): string => `<a href="${href}">x</a>`;

  test("prefixes root relative urls that are missing the base path", () => {
    expect(prefixRootRelativeUrls(link("/search"), "/base")).toBe(
      link("/base/search"),
    );
    expect(
      prefixRootRelativeUrls(
        '<link rel="stylesheet" href="/public/nojs.css">',
        "/base",
      ),
    ).toBe('<link rel="stylesheet" href="/base/public/nojs.css">');
  });

  test("leaves urls that already carry the base path alone", () => {
    for (const href of [
      "/base/nojs/search",
      "/base/nojs/search?q=hello",
      "/base/",
      "/base#top",
    ]) {
      expect(prefixRootRelativeUrls(link(href), "/base")).toBe(link(href));
    }
  });

  test("is idempotent, so a page rendered twice keeps one prefix", () => {
    const once = prefixRootRelativeUrls(link("/nojs/search"), "/base");
    expect(prefixRootRelativeUrls(once, "/base")).toBe(once);
  });

  test("still prefixes a path that merely starts with the base word", () => {
    expect(prefixRootRelativeUrls(link("/baseball"), "/base")).toBe(
      link("/base/baseball"),
    );
  });

  test("leaves protocol relative and absolute urls alone", () => {
    expect(prefixRootRelativeUrls(link("//cdn.test/x"), "/base")).toBe(
      link("//cdn.test/x"),
    );
    expect(prefixRootRelativeUrls(link("https://example.test"), "/base")).toBe(
      link("https://example.test"),
    );
  });

  test("does nothing without a base path", () => {
    expect(prefixRootRelativeUrls(link("/search"), "")).toBe(link("/search"));
  });
});
