import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const THEME_FOLDER = "cache-theme";

let themesRoot: string;
let pluginAssetsRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  themesRoot = await mkdtemp(join(tmpdir(), "degoog-theme-cache-"));
  const themeDir = join(themesRoot, THEME_FOLDER);
  await mkdir(join(themeDir, "images"), { recursive: true });
  await writeFile(join(themeDir, "images", "bg.png"), "fake-png-bytes");
  await writeFile(join(themeDir, "extra.css"), "body { color: red; }");
  process.env.DEGOOG_THEMES_DIR = themesRoot;

  const mod = await import("../../src/server/routes/plugin-assets");
  pluginAssetsRouter = mod.default;
});

afterAll(async () => {
  delete process.env.DEGOOG_THEMES_DIR;
  await rm(themesRoot, { recursive: true, force: true });
});

describe("routes/plugin-assets theme caching", () => {
  test("static theme image gets a long-lived public cache header", async () => {
    const res = await pluginAssetsRouter.request(
      `http://localhost/themes/${THEME_FOLDER}/images/bg.png`,
    );
    expect(res.status).toBe(200);
    const cacheControl = res.headers.get("Cache-Control") ?? "";
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("max-age=");
    expect(cacheControl).not.toContain("no-cache");
  });

  test("theme css still revalidates", async () => {
    const res = await pluginAssetsRouter.request(
      `http://localhost/themes/${THEME_FOLDER}/extra.css`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });
});
