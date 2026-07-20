import { describe, test, expect } from "bun:test";
import { mkdtemp, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { registerExtensionDir } from "../../src/server/utils/plugin-assets";
import { savePluginUpload } from "../../src/server/utils/plugin-uploads";

const bytes = (n: number): Uint8Array => new Uint8Array(n).fill(1);

describe("savePluginUpload", () => {
  test("writes into the extension's uploads/ folder and returns served path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "degoog-upload-"));
    registerExtensionDir("acme-foo-slot", dir);

    const saved = await savePluginUpload("acme-foo-slot", "logo.png", bytes(8));
    expect(saved).not.toBeNull();
    const folder = dir.split("/").pop();
    expect(saved?.path).toBe(`/plugins/${folder}/uploads/${saved?.name}`);

    const files = await readdir(join(dir, "uploads"));
    expect(files).toContain(saved?.name);
  });

  test("sanitizes traversal filenames to a contained basename", async () => {
    const dir = await mkdtemp(join(tmpdir(), "degoog-upload-"));
    registerExtensionDir("acme-bar-slot", dir);

    const saved = await savePluginUpload(
      "acme-bar-slot",
      "../../escape.png",
      bytes(4),
    );
    expect(saved).not.toBeNull();
    expect(saved?.name.includes("/")).toBe(false);
    expect(saved?.name.includes("..")).toBe(false);
    expect(saved?.name.endsWith(".png")).toBe(true);
  });

  test("rejects non-servable extensions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "degoog-upload-"));
    registerExtensionDir("acme-baz-slot", dir);
    const saved = await savePluginUpload("acme-baz-slot", "evil.exe", bytes(4));
    expect(saved).toBeNull();
  });

  test("rejects when the extension has no registered directory", async () => {
    const saved = await savePluginUpload("never-loaded-slot", "a.png", bytes(4));
    expect(saved).toBeNull();
  });
});
