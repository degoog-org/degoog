import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { trimSlash } from "../../src/server/utils/trailing-slash";
import { buildPublicUrl } from "../../src/server/utils/public-url";

const REQ = { url: "http://localhost:4444/opensearch.xml" };

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
});
