import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { themesDir } from "../../src/server/utils/paths";

const THEME_FOLDER = "cache-theme";

let themeDir: string;
let pluginAssetsRouter: {
  request: (req: Request | string) => Response | Promise<Response>;
};

beforeAll(async () => {
  themeDir = join(themesDir(), THEME_FOLDER);
  await mkdir(join(themeDir, "images"), { recursive: true });
  await writeFile(join(themeDir, "images", "bg.png"), "fake-png-bytes");
  await writeFile(join(themeDir, "extra.css"), "body { color: red; }");

  const mod = await import("../../src/server/routes/plugin-assets");
  pluginAssetsRouter = mod.default;
});

afterAll(async () => {
  await rm(themeDir, { recursive: true, force: true });
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
