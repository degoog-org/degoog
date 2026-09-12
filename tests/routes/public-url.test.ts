import { afterAll, beforeAll, describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { trimSlash } from "../../src/server/utils/trailing-slash";
import { buildPublicUrl, getPublicUrl } from "../../src/server/utils/public-url";

const REQ = { url: "http://localhost:4444/opensearch.xml" };

const FORWARDED = {
  "X-Forwarded-Proto": "https",
  "X-Forwarded-Host": "search.example.com",
};

describe("utils/public-url", () => {
  test("a full DEGOOG_BASE_URL overrides the proxied host", () => {
    const out = buildPublicUrl(
      "https://search.example.com/degoog",
      "/degoog",
      REQ,
    );

    expect(out).toBe("https://search.example.com/degoog");
  });

  test("a full DEGOOG_BASE_URL wins over forwarded headers", () => {
    const out = buildPublicUrl("https://search.example.com", "", {
      ...REQ,
      proto: "http",
      host: "wrong.local",
    });

    expect(out).toBe("https://search.example.com");
  });

  test("a path-only DEGOOG_BASE_URL keeps the header heuristic", () => {
    const out = buildPublicUrl("/degoog", "/degoog", {
      ...REQ,
      proto: "https",
      host: "search.example.com",
    });

    expect(out).toBe("https://search.example.com/degoog");
  });

  test("falls back to the request host when nothing is configured", () => {
    expect(buildPublicUrl("", "", REQ)).toBe("http://localhost:4444");
  });

  test("takes the first entry of a forwarded header list", () => {
    const out = buildPublicUrl("", "", {
      ...REQ,
      proto: "https, http",
      host: "search.example.com, inner.local",
    });

    expect(out).toBe("https://search.example.com");
  });
});

describe("utils/public-url proxy trust", () => {
  const app = new Hono();
  app.get("/opensearch.xml", (c) => c.text(getPublicUrl(c)));

  const probe = async (): Promise<Response> =>
    app.request("http://localhost:4444/opensearch.xml", {
      headers: FORWARDED,
    });

  let saved: string | undefined;

  beforeAll(() => {
    saved = process.env.DEGOOG_DISTRUST_PROXY;
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.DEGOOG_DISTRUST_PROXY;
    else process.env.DEGOOG_DISTRUST_PROXY = saved;
  });

  test("ignores forwarded headers when DEGOOG_DISTRUST_PROXY is unset", async () => {
    delete process.env.DEGOOG_DISTRUST_PROXY;
    const res = await probe();

    expect(await res.text()).toBe("http://localhost:4444");
  });

  test("ignores forwarded headers when the proxy is explicitly distrusted", async () => {
    process.env.DEGOOG_DISTRUST_PROXY = "1";
    const res = await probe();

    expect(await res.text()).toBe("http://localhost:4444");
  });

  test("honours forwarded headers when the proxy is trusted", async () => {
    process.env.DEGOOG_DISTRUST_PROXY = "0";
    const res = await probe();

    expect(await res.text()).toBe("https://search.example.com");
  });
});

describe("utils/trailing-slash", () => {
  const app = new Hono();
  app.use(trimSlash());
  app.get("/degoog/settings", (c) => c.text("ok"));

  test("redirects to a relative path, never the internal host", async () => {
    const res = await app.request("http://localhost:4444/degoog/settings/");

    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/degoog/settings");
  });

  test("keeps the query string", async () => {
    const res = await app.request("http://localhost:4444/degoog/settings/?q=a");

    expect(res.headers.get("location")).toBe("/degoog/settings?q=a");
  });

  test("leaves a matched route alone", async () => {
    const res = await app.request("http://localhost:4444/degoog/settings");

    expect(res.status).toBe(200);
  });

  test("leaves a wildcard route that answers its own 404 alone", async () => {
    const wildcard = new Hono();
    wildcard.use(trimSlash());
    wildcard.get("/plugins/:folder/*", (c) => c.notFound());

    const res = await wildcard.request(
      "http://localhost:4444/plugins/demo/assets/",
    );

    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
  });

  test("still redirects a slash-ended path with no matching route", async () => {
    const wildcard = new Hono();
    wildcard.use(trimSlash());
    wildcard.get("/plugins/:folder/*", (c) => c.notFound());

    const res = await wildcard.request("http://localhost:4444/settings/");

    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/settings");
  });
});
