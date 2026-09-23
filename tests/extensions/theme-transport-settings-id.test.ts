import { describe, test, expect } from "bun:test";
import { makeExtID } from "../../src/server/utils/extension-support/extension-id";
import { getThemeSettingsId } from "../../src/server/extensions/themes/registry";
import { getTransportSettingsId } from "../../src/server/extensions/transports/registry";

describe("extension settings ids", () => {
  test("theme registry uses the canonical -theme settings key", () => {
    expect(getThemeSettingsId("degoog-org-official-extensions-catpuccin-theme")).toBe(
      "degoog-org-official-extensions-catpuccin-theme",
    );
  });

  test("transport registry uses the canonical transport name as settings key", () => {
    const id = makeExtID(
      "degoog-org-official-extensions-degoog-fplay",
      "transport",
    );
    expect(getTransportSettingsId({ name: id })).toBe(id);
  });

  test("autocomplete canonical ids use the -autocomplete suffix", () => {
    expect(makeExtID("degoog-org-official-extensions-bing", "autocomplete")).toBe(
      "degoog-org-official-extensions-bing-autocomplete",
    );
    expect(makeExtID("degoog-org-official-extensions-bing-autocomplete", "autocomplete")).toBe(
      "degoog-org-official-extensions-bing-autocomplete",
    );
  });
});
