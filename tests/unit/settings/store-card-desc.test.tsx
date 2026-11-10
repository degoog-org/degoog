import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { renderHtml } from "../../../src/shared/ui/tribute/html";
import { installClientEnv } from "../../helpers/client-env";
import type { StoreActions, StoreItem, StoreState } from "../../../src/client/types/store-tab";

const MD_MOD = "../../../src/client/utils/dom/md";

type CardDescModule = typeof import("../../../src/client/settings/store/render/card/card-desc");

let CardDesc: CardDescModule["CardDesc"];
let syncClampedDescs: CardDescModule["syncClampedDescs"];
let restoreClientEnv: () => void;
let mdReal: Record<string, unknown>;

const ITEM: StoreItem = {
  path: "plugins/kagi-favicons",
  repoSlug: "repo",
  repoUrl: "https://example.test/repo.git",
  repoName: "official-extensions",
  name: "Kagi Favicons",
  description: "The favicon proxy behind Kagi News, no account needed.",
  version: "1.0.0",
  type: "favicon",
  installed: false,
  screenshots: [],
};
const ID = `${ITEM.repoUrl}::${ITEM.path}::${ITEM.type}`;

const _state = (open: string[] = [], clamped: string[] = []): StoreState =>
  ({ descOpen: new Set(open), descClamped: new Set(clamped) }) as StoreState;

const _render = (state: StoreState): string =>
  renderHtml(<CardDesc item={ITEM} state={state} actions={{} as StoreActions} />);

const _root = (descs: { id: string; scroll: number; client: number }[]): ParentNode =>
  ({
    querySelectorAll: () =>
      descs.map((d) => ({
        getAttribute: () => d.id,
        scrollHeight: d.scroll,
        clientHeight: d.client,
      })),
  }) as unknown as ParentNode;

beforeAll(async () => {
  restoreClientEnv = installClientEnv();
  mdReal = { ...(await import(MD_MOD)) };
  mock.module(MD_MOD, () => ({ ...mdReal, renderMdInline: (text: string) => text }));
  ({ CardDesc, syncClampedDescs } = await import(
    "../../../src/client/settings/store/render/card/card-desc"
  ));
});

afterAll(() => {
  mock.module(MD_MOD, () => mdReal);
  restoreClientEnv();
});

describe("store card description", () => {
  test("a description that fits has no toggle", () => {
    expect(_render(_state())).not.toContain("<button");
  });

  test("a clamped description offers to show more", () => {
    const html = _render(_state([], [ID]));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("settings-page.store.show-more");
  });

  test("an open description drops the clamp and offers to show less", () => {
    const html = _render(_state([ID]));
    expect(html).toContain("store-card-desc--open");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("settings-page.store.show-less");
  });
});

describe("syncClampedDescs", () => {
  test("records which descriptions overflow their clamp", () => {
    const state = _state();
    expect(syncClampedDescs(_root([{ id: "a", scroll: 60, client: 40 }, { id: "b", scroll: 40, client: 40 }]), state)).toBe(true);
    expect([...state.descClamped]).toEqual(["a"]);
  });

  test("reports no change when nothing moved, so the store does not repaint", () => {
    const state = _state([], ["a"]);
    expect(syncClampedDescs(_root([{ id: "a", scroll: 60, client: 40 }]), state)).toBe(false);
  });

  test("forgets a clamp once a wider card fits the text", () => {
    const state = _state([], ["a"]);
    expect(syncClampedDescs(_root([{ id: "a", scroll: 40, client: 40 }]), state)).toBe(true);
    expect(state.descClamped.size).toBe(0);
  });

  test("leaves open descriptions alone so their toggle stays", () => {
    const state = _state(["a"], ["a"]);
    expect(syncClampedDescs(_root([{ id: "a", scroll: 80, client: 80 }]), state)).toBe(false);
    expect(state.descClamped.has("a")).toBe(true);
  });
});
