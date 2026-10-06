import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getSlotExtensionMeta,
  initSlotPlugins,
} from "../../src/server/extensions/slots/registry";

const SLOT_SOURCE = `export const slot = {
  name: "Demo",
  description: "Demo slot",
  position: "above-results",
  settingsSchema: [
    { key: "apiKey", label: "API key", type: "text", description: "Your key", placeholder: "abc" },
    { key: "untranslated", label: "Kept as is", type: "text" },
  ],
  trigger: () => true,
  execute: async () => ({ html: "" }),
};
`;

const LOCALE = {
  "demo-slot": {
    name: "Demo tradotto",
    description: "Slot di prova",
    settings: {
      apiKey: {
        label: "Chiave API",
        description: "La tua chiave",
        placeholder: "xyz",
      },
    },
  },
};

describe("slot extension meta translation", () => {
  let dir = "";
  const orig = process.env.DEGOOG_PLUGINS_DIR;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "degoog-slot-t-"));
    const plugin = join(dir, "demo");
    await mkdir(join(plugin, "locales"), { recursive: true });
    await writeFile(join(plugin, "index.js"), SLOT_SOURCE);
    await writeFile(join(plugin, "locales", "en.json"), JSON.stringify(LOCALE));
    process.env.DEGOOG_PLUGINS_DIR = dir;
    await initSlotPlugins();
  });

  afterAll(async () => {
    if (orig !== undefined) process.env.DEGOOG_PLUGINS_DIR = orig;
    else delete process.env.DEGOOG_PLUGINS_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  test("translates a slot's own name, description and settings from its locales", async () => {
    const meta = (await getSlotExtensionMeta()).find((m) => m.id === "demo-slot");
    expect(meta).toBeDefined();
    expect(meta!.displayName).toBe("Demo tradotto");
    expect(meta!.description).toBe("Slot di prova");
    const apiKey = meta!.settingsSchema.find((f) => f.key === "apiKey");
    expect(apiKey?.label).toBe("Chiave API");
    expect(apiKey?.description).toBe("La tua chiave");
    expect(apiKey?.placeholder).toBe("xyz");
    const kept = meta!.settingsSchema.find((f) => f.key === "untranslated");
    expect(kept?.label).toBe("Kept as is");
  });
});
