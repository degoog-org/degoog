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

type Case = [string, Record<string, unknown>, string];

describe("nojs renderTemplateString", () => {
  test("fills, escapes and stringifies placeholders", () => {
    const cases: Case[] = [
      ["<p>{{ title }}</p>", { title: "Hello" }, "<p>Hello</p>"],
      ["{{ result.url }}", { result: { url: "/x" } }, "/x"],
      ["[{{ nope }}]", {}, "[]"],
      ["[{{ a.b.c }}]", { a: null }, "[]"],
      [
        "{{ v }}",
        { v: `<script>&"'</script>` },
        "&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;",
      ],
      ["{{ v }}", { v: "a\u00a0b" }, "a&nbsp;b"],
      ["{{ n }}/{{ b }}", { n: 0, b: false }, "0/false"],
      ["<p>static</p>", {}, "<p>static</p>"],
    ];
    for (const [tpl, data, expected] of cases) {
      expect(renderTemplateString(tpl, data)).toBe(expected);
    }
  });

  test("renders if, each and nested blocks", () => {
    const ifTpl = "{{#if show}}yes{{/if show}}";
    const emptyTpl =
      "{{#if items}}has{{/if items}}{{^if items}}none{{/if items}}";
    const cases: Case[] = [
      [ifTpl, { show: true }, "yes"],
      [ifTpl, { show: false }, ""],
      [ifTpl, {}, ""],
      [emptyTpl, { items: [] }, "none"],
      [emptyTpl, { items: [1] }, "has"],
      ["{{^if error}}ok{{/if error}}", { error: "" }, "ok"],
      ["{{^if error}}ok{{/if error}}", { error: "boom" }, ""],
      [
        "{{#each items}}<li>{{ name }}</li>{{/each items}}",
        { items: [{ name: "a" }, { name: "b" }] },
        "<li>a</li><li>b</li>",
      ],
      ["{{#each xs}}{{ @index }}:{{ . }};{{/each xs}}", { xs: ["a", "b"] }, "0:a;1:b;"],
      [
        "{{#each xs}}{{ prefix }}{{ . }}{{/each xs}}",
        { prefix: "-", xs: ["a"] },
        "-a",
      ],
      ["{{#each xs}}x{{/each xs}}", { xs: "nope" }, ""],
      [
        "{{#if outer}}{{#each items}}{{#if ok}}[{{ name }}]{{/if ok}}{{/each items}}{{/if outer}}",
        {
          outer: true,
          items: [
            { name: "a", ok: true },
            { name: "b", ok: false },
          ],
        },
        "[a]",
      ],
      [
        `{{#each xs}}<a title="{{ . }}"></a>{{/each xs}}`,
        { xs: [`"x"`] },
        `<a title="&quot;x&quot;"></a>`,
      ],
    ];
    for (const [tpl, data, expected] of cases) {
      expect(renderTemplateString(tpl, data)).toBe(expected);
    }
  });
});

describe("nojs shell filling", () => {
  test("rewrites elements by id and by class", () => {
    const dollars = "$& $` $' $1 $$";
    const cases: [string, string][] = [
      [
        fillById('<div id="a"></div>', "a", "<p>x</p>"),
        '<div id="a"><p>x</p></div>',
      ],
      [
        fillById('<div id="a"><div id="b">old</div></div>', "a", "new"),
        '<div id="a">new</div>',
      ],
      [
        fillById('<div id="a" class="c"></div>', "a", "x"),
        '<div id="a" class="c">x</div>',
      ],
      [fillById('<div id="a"></div>', "nope", "x"), '<div id="a"></div>'],
      [
        fillById('<div id="a"></div>', "a", dollars),
        `<div id="a">${dollars}</div>`,
      ],
      [
        replaceElementById('<main><div id="a">x</div></main>', "a", "<b>y</b>"),
        "<main><b>y</b></main>",
      ],
      [
        removeElementById('<div><button id="go">x</button></div>', "go"),
        "<div></div>",
      ],
      [
        wrapElementById('<div id="a">x</div>', "a", "<form>", "</form>"),
        '<form><div id="a">x</div></form>',
      ],
      [
        appendToId('<div id="a"><p>1</p></div>', "a", "<p>2</p>"),
        '<div id="a"><p>1</p><p>2</p></div>',
      ],
      [addClassById('<div id="a"></div>', "a", "m"), '<div id="a" class="m"></div>'],
      [
        addClassById('<div id="a" class="x y"></div>', "a", "m"),
        '<div id="a" class="x y m"></div>',
      ],
      [
        setAttributesById('<input id="q" type="text" />', "q", {
          name: "q",
          value: "hello",
        }),
        '<input id="q" type="text" name="q" value="hello">',
      ],
      [
        setAttributesById(
          '<form id="f" action="/search" method="get"></form>',
          "f",
          { action: "/nojs/search", method: "post" },
        ),
        '<form id="f" action="/nojs/search" method="post"></form>',
      ],
      [
        setAttributesByClass(
          '<a href="/" class="results-logo">d</a>',
          "results-logo",
          { href: "/nojs" },
        ),
        '<a class="results-logo" href="/nojs">d</a>',
      ],
      [
        addClassWhereClass(
          '<span class="logo-d logo-letter">d</span><span class="other">x</span>',
          "logo-letter",
          "nojs-logo-letter",
        ),
        '<span class="logo-d logo-letter nojs-logo-letter">d</span><span class="other">x</span>',
      ],
      [
        addClassWhereClass(
          '<span class="logo-letter nojs-logo-letter">d</span>',
          "logo-letter",
          "nojs-logo-letter",
        ),
        '<span class="logo-letter nojs-logo-letter">d</span>',
      ],
      [
        insertBeforeHeadEnd("<head><title>x</title></head>", "<link>"),
        "<head><title>x</title><link></head>",
      ],
    ];
    for (const [actual, expected] of cases) {
      expect(actual).toBe(expected);
    }
  });
});

describe("nojs template sanitising", () => {
  test("strips scripts, preloads and inline handlers but keeps ordinary markup", () => {
    const ordinary = '<div class="a" data-tooltip="on the house">x</div>';
    const cases: [string, string][] = [
      [
        sanitizeTemplate('<p>a</p><script>var t = "</p>";</script><p>b</p>'),
        "<p>a</p><p>b</p>",
      ],
      [
        sanitizeTemplate(
          '<body><script type="module" src="/app.js"></script></body>',
        ),
        "<body></body>",
      ],
      [
        sanitizeTemplate(
          `<i onmouseenter="this.classList.add('x')" onmouseleave='y()' class="i"></i>`,
        ),
        '<i class="i"></i>',
      ],
      [sanitizeTemplate("<img src=x onerror=alert(1) />"), "<img src=x />"],
      [
        sanitizeTemplate(
          '<link rel="modulepreload" href="/public/app.js" /><title>x</title>',
        ),
        "<title>x</title>",
      ],
      [sanitizeTemplate(ordinary), ordinary],
    ];
    for (const [actual, expected] of cases) {
      expect(actual).toBe(expected);
    }
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

  test("returns null for an unsafe file name or an unknown template", async () => {
    expect(await loadNojsTemplate("../layout")).toBeNull();
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
    expect(prefixRootRelativeUrls(link("/baseball"), "/base")).toBe(
      link("/base/baseball"),
    );
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
    const once = prefixRootRelativeUrls(link("/nojs/search"), "/base");
    expect(prefixRootRelativeUrls(once, "/base")).toBe(once);
  });

  test("leaves protocol relative, absolute and unbased urls alone", () => {
    expect(prefixRootRelativeUrls(link("//cdn.test/x"), "/base")).toBe(
      link("//cdn.test/x"),
    );
    expect(prefixRootRelativeUrls(link("https://example.test"), "/base")).toBe(
      link("https://example.test"),
    );
    expect(prefixRootRelativeUrls(link("/search"), "")).toBe(link("/search"));
  });
});
