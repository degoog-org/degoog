import { describe, expect, test } from "bun:test";
import {
  SERVER_SETTINGS_PRESETS,
  type ServerPresetValueKey,
} from "../../src/client/settings/server/presets";

const byId = (id: string) => {
  const preset = SERVER_SETTINGS_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`Missing preset: ${id}`);
  return preset;
};

describe("server settings presets", () => {
  test("define valid one-shot payloads without sensitive or user-authored fields", () => {
    const blocked = new Set<ServerPresetValueKey>([
      "customCss",
      "domainBlockList",
      "domainReplaceList",
      "domainScoreList",
      "imageProxyAllowList",
      "proxyUrls",
      "languages",
    ]);

    for (const preset of SERVER_SETTINGS_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.labelKey).toBeTruthy();
      expect(preset.descriptionKey).toBeTruthy();
      expect(Object.keys(preset.values).length).toBeGreaterThan(0);
      expect(preset.highlights.length).toBeGreaterThan(0);
      for (const key of Object.keys(preset.values) as ServerPresetValueKey[]) {
        expect(blocked.has(key)).toBe(false);
      }
    }
  });

  test("keeps streaming enabled for most presets and disables it for compatibility mode", () => {
    const streamingEnabled = SERVER_SETTINGS_PRESETS.filter(
      (preset) => preset.values.streamingEnabled === "true",
    );
    expect(streamingEnabled.length).toBeGreaterThan(
      SERVER_SETTINGS_PRESETS.length / 2,
    );
    expect(byId("compat-low-resource").values.streamingEnabled).toBe("false");
  });

  test("enables streaming auto-retry only for selected presets", () => {
    const retryEnabled = SERVER_SETTINGS_PRESETS.filter(
      (preset) => preset.values.streamingAutoRetry === "true",
    );
    expect(retryEnabled.length).toBeGreaterThan(0);
    expect(retryEnabled.length).toBeLessThan(SERVER_SETTINGS_PRESETS.length);
    for (const preset of SERVER_SETTINGS_PRESETS) {
      if (preset.values.streamingAutoRetry === "true") {
        expect(Number(preset.values.streamingMaxRetries)).toBeGreaterThanOrEqual(2);
      } else {
        expect(preset.values.streamingMaxRetries).toBeUndefined();
      }
    }
  });

  test("locks down local image proxy access for public presets", () => {
    expect(byId("public-web").values.imageProxyAllowLocal).toBe("false");
    expect(byId("hardened-public").values.imageProxyAllowLocal).toBe("false");
  });

  test("enables API key enforcement toggles for hardened public mode", () => {
    const preset = byId("hardened-public");
    expect(preset.values.apiKeySearchEnabled).toBe("true");
    expect(preset.values.apiKeySuggestEnabled).toBe("true");
  });
});
