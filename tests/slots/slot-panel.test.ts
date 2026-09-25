import { describe, expect, test } from "bun:test";
import { slotContext, toSlotPanel } from "../../src/server/extensions/slots/run";
import { outgoingFetch } from "../../src/server/utils/net/outgoing";
import { buildSignedProxyUrl } from "../../src/server/utils/net/proxy-sign";
import { createCache, useCache } from "../../src/server/utils/cache/cache";
import { SlotPanelPosition, type ScoredResult } from "../../src/shared/search-types";
import type { SlotPlugin } from "../../src/server/types/extension";

const plugin = { id: "demo-slot", gridSize: 2 } as unknown as SlotPlugin;

describe("slot panel", () => {
  test("blank or whitespace html renders no panel", () => {
    expect(toSlotPanel("demo-slot", plugin, { html: "" }, "en", SlotPanelPosition.AtAGlance)).toBeNull();
    expect(toSlotPanel("demo-slot", plugin, { html: "  \n " }, "en", SlotPanelPosition.AtAGlance)).toBeNull();
  });

  test("a panel carries id, title, position and grid size, with scripts scoped to the slot", () => {
    const panel = toSlotPanel(
      "demo-slot",
      plugin,
      { title: "Demo", html: "<p>x</p><script>t('k')</script>" },
      "en",
      SlotPanelPosition.AtAGlance,
    );
    expect(panel).toEqual({
      id: "demo-slot",
      title: "Demo",
      html: expect.stringContaining('window.scopedT("slots/demo-slot")'),
      position: SlotPanelPosition.AtAGlance,
      gridSize: 2,
    });
    expect(panel?.html.startsWith("<p>x</p><script>(function(t){t('k')")).toBe(true);
  });
});

describe("slot context", () => {
  const results = [{ url: "u" }] as unknown as ScoredResult[];

  test("hands plugins the shared fetch, signer and caches", () => {
    expect(slotContext("1.2.3.4", results, "de") as unknown).toEqual({
      clientIp: "1.2.3.4",
      results,
      fetch: outgoingFetch,
      signProxyUrl: buildSignedProxyUrl,
      createCache,
      useCache,
      locale: "de",
    });
  });

  test("only nojs renders are flagged", () => {
    expect(slotContext(undefined, undefined, undefined)).not.toHaveProperty("nojs");
    expect(slotContext(undefined, undefined, undefined, true).nojs).toBe(true);
  });
});
