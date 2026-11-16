import { describe, expect, test } from "bun:test";
import type { ScoredResult } from "../../../src/shared/search-types";
import { feedSearchStream, type FeedView } from "../../../src/client/utils/search/streaming/stream-feed";
import type { SearchEventSource } from "../../../src/client/utils/search/streaming/fetch-event-stream";
import { shownKeys, unseenRows } from "../../../src/client/utils/search/streaming/page-rows";

type Listener = (event: MessageEvent<string>) => void;

const fakeSource = () => {
  const listeners = new Map<string, Listener[]>();
  const source: SearchEventSource = {
    addEventListener: (type, listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    close: () => {},
  };
  const fire = (type: string, data: unknown = {}): void => {
    for (const listener of listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
  };
  return { source, fire };
};

const result = (url: string): ScoredResult => ({
  title: url,
  url,
  snippet: "",
  source: "test",
  sources: ["test"],
  score: 1,
});

const recorder = () => {
  const log: string[] = [];
  const view: FeedView = {
    results: (results) => log.push(`results:${results.map((r) => r.url).join(",")}`),
    timings: (rows) =>
      log.push(`timings:${rows.map((r) => (r.emitting ? `${r.name}~${r.emitting.count}` : r.name)).join(",")}`),
    settled: () => log.push("settled"),
    done: () => log.push("done"),
    failed: () => log.push("failed"),
  };
  return { log, view };
};

const timing = (name: string, resultCount: number) => ({ name, time: 10, resultCount });

const playBufferedRun = (fire: (type: string, data?: unknown) => void): void => {
  fire("engine-partial", { engine: "Google", emitted: 1, expected: 3, results: [result("g1")] });
  fire("engine-result", { engine: "Bing", timing: timing("Bing", 1), results: [result("g1"), result("b1")] });
  fire("engine-result", { engine: "Brave", timing: timing("Brave", 1), results: [result("g1"), result("b1"), result("v1")] });
  fire("results-settled");
  fire("engine-partial", { engine: "Google", emitted: 2, expected: 3, results: [result("g1"), result("b1"), result("v1"), result("g2")] });
  fire("engine-result", { engine: "Google", timing: timing("Google", 2), results: [result("g1"), result("b1"), result("v1"), result("g2")] });
  fire("done", { totalTime: 100, engineTimings: [], relatedSearches: [] });
};

describe("feedSearchStream", () => {
  test("streaming off holds everything until results-settled, then applies the emitter live", () => {
    const { source, fire } = fakeSource();
    const { log, view } = recorder();
    feedSearchStream(source, { progressive: false, live: () => true }, view);

    playBufferedRun(fire);

    expect(log).toEqual([
      "results:g1,b1,v1",
      "timings:Google~1,Bing,Brave",
      "settled",
      "results:g1,b1,v1,g2",
      "timings:Google~2,Bing,Brave",
      "results:g1,b1,v1,g2",
      "timings:Google,Bing,Brave",
      "done",
    ]);
  });

  test("streaming on renders every frame as it arrives", () => {
    const { source, fire } = fakeSource();
    const { log, view } = recorder();
    feedSearchStream(source, { progressive: true, live: () => true }, view);

    playBufferedRun(fire);

    expect(log.filter((line) => line.startsWith("results:"))).toEqual([
      "results:g1",
      "results:g1,b1",
      "results:g1,b1,v1",
      "results:g1,b1,v1,g2",
      "results:g1,b1,v1,g2",
    ]);
  });

  test("streaming off with no emitter shows everything at once on done", () => {
    const { source, fire } = fakeSource();
    const { log, view } = recorder();
    feedSearchStream(source, { progressive: false, live: () => true }, view);

    fire("engine-result", { engine: "Bing", timing: timing("Bing", 1), results: [result("b1")] });
    fire("engine-result", { engine: "Brave", timing: timing("Brave", 1), results: [result("b1"), result("v1")] });
    fire("done", { totalTime: 100, engineTimings: [], relatedSearches: [] });

    expect(log).toEqual(["results:b1,v1", "timings:Bing,Brave", "done"]);
  });

  test("frames for a search that is no longer current are ignored", () => {
    const { source, fire } = fakeSource();
    const { log, view } = recorder();
    let current = true;
    feedSearchStream(source, { progressive: true, live: () => current }, view);

    fire("engine-result", { engine: "Bing", timing: timing("Bing", 1), results: [result("b1")] });
    current = false;
    fire("engine-result", { engine: "Brave", timing: timing("Brave", 1), results: [result("v1")] });
    fire("done", { totalTime: 100, engineTimings: [], relatedSearches: [] });

    expect(log).toEqual(["results:b1", "timings:Bing"]);
  });
});

describe("appended page rows", () => {
  test("rows already on screen from earlier pages are skipped, whatever their www or trailing slash", () => {
    const shown = shownKeys([result("https://www.a.test/x/"), result("https://b.test/")]);
    const page = [
      result("https://a.test/x"),
      result("https://www.b.test"),
      result("https://c.test/new"),
    ];
    expect(unseenRows(page, shown).map((r) => r.url)).toEqual(["https://c.test/new"]);
  });
});
