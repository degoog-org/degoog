import { describe, test, expect, beforeAll } from "bun:test";
import { hasRequiredSearchThemeNodes } from "../../src/server/routes/pages";

let pagesRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  const mod = await import("../../src/server/routes/pages");
  pagesRouter = mod.default;
});

describe("routes/pages", () => {
  test("GET / returns 200 and HTML", async () => {
    const res = await pagesRouter.request("http://localhost/");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  test("GET /?q=foo redirects to /search", async () => {
    const res = await pagesRouter.request("http://localhost/?q=foo");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/search");
  });

  test("GET /search returns 200 and HTML", async () => {
    const res = await pagesRouter.request("http://localhost/search");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  test("search theme compatibility requires the image tools, preview panel, and lightbox nodes", () => {
    expect(
      hasRequiredSearchThemeNodes(
        `
          <div id="image-tools-bar"></div>
          <aside id="media-preview-panel"></aside>
          <div id="media-lightbox"></div>
        `,
      ),
    ).toBe(true);

    expect(
      hasRequiredSearchThemeNodes(
        `
          <main>Theme override</main>
          <div id="image-tools-bar"></div>
        `,
      ),
    ).toBe(false);
  });
});
