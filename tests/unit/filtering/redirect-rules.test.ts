import { describe, expect, test } from "bun:test";
import {
  applyRedirect,
  checkRedirectRule,
  parseRedirectList,
  serializeRedirectRules,
  type CompiledRedirect,
  type RedirectRule,
} from "../../../src/shared/redirects/redirect-rules";
import { RedirectProblem } from "../../../src/shared/redirects/redirect-match";
import {
  SubdomainPlace,
  buildExampleRule,
  inferRedirect,
  inferredChoices,
  reproducesExample,
  runRule,
  sampleLink,
  type RedirectExample,
} from "../../../src/shared/redirects/redirect-builder";

const compile = (rules: RedirectRule[]): CompiledRedirect[] =>
  rules.map((rule) => {
    const check = checkRedirectRule(rule);
    if (!check.ok) throw new Error(`rule failed: ${check.problem}`);
    return check.compiled;
  });

const redirect = (raw: string, url: string): string =>
  applyRedirect(url, compile(parseRedirectList(raw).rules))?.url ?? url;

const line = (match: string, replace: string): string =>
  JSON.stringify({ match, replace });

describe("redirect rules with regex captures", () => {
  const fandom = [
    line("^(www\\.)?fandom\\.com$", "antifandom.com"),
    line("^(?!www\\.)(.*)\\.fandom\\.com$", "antifandom.com/\\1"),
  ].join("\n");

  test.each([
    ["https://halo.fandom.com/wiki/Cortana", "https://antifandom.com/halo/wiki/Cortana"],
    ["https://www.fandom.com/topics?x=1#top", "https://antifandom.com/topics?x=1#top"],
    ["https://fandom.com/", "https://antifandom.com/"],
    ["https://notfandom.com/wiki", "https://notfandom.com/wiki"],
  ])("fandom %s", (input, expected) => {
    expect(redirect(fandom, input)).toBe(expected);
  });

  const stack = [
    line("^(.*\\.)?stackoverflow\\.com$", "anonymousoverflow.privacyredirect.com"),
    line("^(?!www\\.)(.*)\\.stackexchange\\.com$", "anonymousoverflow.privacyredirect.com/exchange/$1"),
  ].join("\n");

  test("stackexchange subdomain moves into the path", () => {
    expect(redirect(stack, "https://unix.stackexchange.com/questions/1/a")).toBe(
      "https://anonymousoverflow.privacyredirect.com/exchange/unix/questions/1/a",
    );
    expect(redirect(stack, "https://stackoverflow.com/questions/2")).toBe(
      "https://anonymousoverflow.privacyredirect.com/questions/2",
    );
  });

  test("named groups work in both python and javascript spelling", () => {
    const raw = [
      line("^(?P<wiki>[a-z]+)\\.wikipedia\\.org$", "wiki.example.com/\\g<wiki>"),
      line("^(?<lang>[a-z]+)\\.wiktionary\\.org$", "dict.example.com/$<lang>"),
    ].join("\n");
    expect(redirect(raw, "https://en.wikipedia.org/wiki/A")).toBe("https://wiki.example.com/en/wiki/A");
    expect(redirect(raw, "https://de.wiktionary.org/wiki/B")).toBe("https://dict.example.com/de/wiki/B");
  });

  test("a full https target with tokens is used exactly", () => {
    const raw = line("youtube.com", "https://invidious.example.com/watch{{query}}");
    expect(redirect(raw, "https://www.youtube.com/watch?v=abc")).toBe(
      "https://invidious.example.com/watch?v=abc",
    );
  });

  test("a full https target without tokens drops the original path", () => {
    expect(redirect(line("reddit.com", "https://redlib.example.com/"), "https://reddit.com/r/x")).toBe(
      "https://redlib.example.com/",
    );
  });

  test("the first matching rule wins", () => {
    const raw = [line("old.reddit.com", "one.example"), line("reddit.com", "two.example")].join("\n");
    expect(redirect(raw, "https://old.reddit.com/r/x")).toBe("https://one.example/r/x");
    expect(redirect(raw, "https://www.reddit.com/r/x")).toBe("https://two.example/r/x");
  });

  test("a plain domain does not match look-alike hosts", () => {
    expect(redirect(line("reddit.com", "redlib.example"), "https://notreddit.com/")).toBe(
      "https://notreddit.com/",
    );
  });

  test("targets that are not http or https are refused", () => {
    const check = checkRedirectRule({ match: "reddit.com", replace: "javascript:alert(1)//{{path}}" });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.problem).toBe(RedirectProblem.BadTarget);
  });
});

describe("redirect rule validation", () => {
  test.each([
    [{ match: "", replace: "a.com" }, RedirectProblem.MissingMatch],
    [{ match: "a.com", replace: " " }, RedirectProblem.MissingReplace],
    [{ match: "^(unclosed", replace: "a.com" }, RedirectProblem.InvalidRegex],
    [{ match: "^(a+)+$", replace: "a.com" }, RedirectProblem.SlowRegex],
    [{ match: "^(a|aa)*$", replace: "a.com" }, RedirectProblem.SlowRegex],
    [{ match: `^${"a".repeat(400)}$`, replace: "a.com" }, RedirectProblem.TooLong],
  ])("%o is refused with %s", (rule, problem) => {
    const check = checkRedirectRule(rule);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.problem).toBe(problem);
  });

  test("optional groups with a quantifier inside are allowed", () => {
    expect(checkRedirectRule({ match: "^(?:www\\.)?(?:(.+)\\.)?fandom\\.com$", replace: "a.com/$1" }).ok).toBe(true);
  });
});

describe("legacy a -> b lines", () => {
  test.each([
    ["reddit.com -> redlib.example.com", "https://www.reddit.com/r/x?y=1#z", "https://redlib.example.com/r/x?y=1#z"],
    ["wikipedia.org -> https://wiki.example.com/viewer#zim", "https://en.wikipedia.org/wiki/A", "https://wiki.example.com/viewer#zim"],
    ["wikipedia.org -> wiki.example.com/viewer#zim", "https://en.wikipedia.org/wiki/A", "https://wiki.example.com/viewer#zim"],
    ["wikipedia.org -> wiki.example.com/viewer#x{{path}}", "https://en.wikipedia.org/wiki/A", "https://wiki.example.com/viewer#x/wiki/A"],
    ["/^(www\\.)?youtube\\.com$/ -> yt.example.com", "https://www.youtube.com/watch?v=1", "https://yt.example.com/watch?v=1"],
    ["/reddit/ -> redlib.example.com", "https://old.reddit.com/r/x", "https://redlib.example.com/r/x"],
    ["price.com -> shop.example/$1", "https://price.com/", "https://shop.example/$1"],
  ])("%s keeps its old behaviour", (raw, input, expected) => {
    expect(redirect(raw, input)).toBe(expected);
  });

  test("old, new and unreadable lines live side by side", () => {
    const parsed = parseRedirectList(
      ["a.com -> b.com", line("c.com", "d.com"), "garbage", "{broken json", ""].join("\n"),
    );
    expect(parsed.rules).toEqual([
      { match: "a.com", replace: "b.com" },
      { match: "c.com", replace: "d.com" },
    ]);
    expect(parsed.legacy).toBe(1);
    expect(parsed.unreadable).toEqual(["garbage", "{broken json"]);
  });

  test("saving a parsed legacy list writes the new format and reads back the same", () => {
    const legacy = "a.com -> b.com\n/^x\\.org$/ -> https://y.org/{{path}}";
    const saved = serializeRedirectRules(parseRedirectList(legacy).rules);
    expect(saved.split("\n").every((entry) => entry.startsWith("{"))).toBe(true);
    for (const url of ["https://sub.a.com/p?q=1", "https://x.org/deep/path"]) {
      expect(redirect(saved, url)).toBe(redirect(legacy, url));
    }
  });
});

describe("redirect generator", () => {
  const infer = (before: string, after: string): RedirectExample => {
    const example = inferRedirect(before, after);
    if (!example) throw new Error("links did not parse");
    return example;
  };

  const ruleOf = (example: RedirectExample, overrides = {}) =>
    buildExampleRule(example, { ...inferredChoices(example), ...overrides });

  test("subdomain moved into the path", () => {
    const example = infer("https://golf.happygilmore.com/swing/tips", "https://billymadison.com/golf/swing/tips");
    expect(example.place).toBe(SubdomainPlace.Path);
    expect(inferredChoices(example)).toEqual({ allSubdomains: true, keepRest: true });
    expect(ruleOf(example)).toEqual({
      match: "^(?:www\\.)?(?:(.+)\\.)?happygilmore\\.com$",
      replace: "billymadison.com/$1",
    });
    expect(reproducesExample(example)).toBe(true);
    const sample = sampleLink(example, inferredChoices(example));
    expect(sample).toBe("https://tennis.happygilmore.com/serve");
    expect(runRule(ruleOf(example), sample!)).toBe("https://billymadison.com/tennis/serve");
    expect(runRule(ruleOf(example), "https://www.happygilmore.com/caddy")).toBe("https://billymadison.com/caddy");
  });

  test("plain domain swap", () => {
    const example = infer("https://golf.happygilmore.com/x?y=1", "https://billymadison.com/x?y=1");
    expect(example.place).toBe(SubdomainPlace.None);
    expect(ruleOf(example)).toEqual({ match: "happygilmore.com", replace: "billymadison.com" });
    expect(reproducesExample(example)).toBe(true);
    expect(runRule(ruleOf(example), "https://tennis.happygilmore.com/serve")).toBe("https://billymadison.com/serve");
  });

  test("subdomain kept as a subdomain", () => {
    const example = infer("https://golf.happygilmore.com/swing", "https://golf.billymadison.com/swing");
    expect(example.place).toBe(SubdomainPlace.Host);
    expect(ruleOf(example)).toEqual({ match: "^(.+)\\.happygilmore\\.com$", replace: "$1.billymadison.com" });
    expect(reproducesExample(example)).toBe(true);
    expect(runRule(ruleOf(example), "https://tennis.happygilmore.com/serve")).toBe("https://tennis.billymadison.com/serve");
  });

  test("fixed destination", () => {
    const example = infer("https://golf.happygilmore.com/swing/tips", "https://billymadison.com/");
    expect(inferredChoices(example).keepRest).toBe(false);
    expect(ruleOf(example)).toEqual({ match: "happygilmore.com", replace: "https://billymadison.com/" });
    expect(reproducesExample(example)).toBe(true);
    expect(runRule(ruleOf(example), "https://tennis.happygilmore.com/serve")).toBe("https://billymadison.com/");
  });

  test("unticking other subdomains matches only that exact host", () => {
    const example = infer("https://golf.happygilmore.com/swing/tips", "https://billymadison.com/golf/swing/tips");
    const rule = ruleOf(example, { allSubdomains: false });
    expect(rule).toEqual({ match: "^golf\\.happygilmore\\.com$", replace: "billymadison.com/golf" });
    expect(runRule(rule, "https://tennis.happygilmore.com/serve")).toBeNull();
    expect(sampleLink(example, { allSubdomains: false, keepRest: true })).toBeNull();
  });

  test("unticking keep the rest drops the original path", () => {
    const example = infer("https://golf.happygilmore.com/swing/tips", "https://billymadison.com/golf/swing/tips");
    expect(runRule(ruleOf(example, { keepRest: false }), "https://golf.happygilmore.com/swing/tips")).toBe(
      "https://billymadison.com/golf",
    );
  });

  test("an http destination with a port keeps the rest of the link", () => {
    const example = infer("https://www.happygilmore.com/a?b=1", "http://10.0.0.2:8080/a?b=1");
    expect(reproducesExample(example)).toBe(true);
    expect(runRule(ruleOf(example), "https://tennis.happygilmore.com/c")).toBe("http://10.0.0.2:8080/c");
  });

  test("links that cannot be read give nothing", () => {
    expect(inferRedirect("not a link", "https://billymadison.com/")).toBeNull();
    expect(inferRedirect("https://happygilmore.com/", "")).toBeNull();
  });
});
