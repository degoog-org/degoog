import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { initServerKey } from "../../src/server/utils/security/server-key";
import type { BangCommand, CommandContext, CommandResult } from "../../src/server/types/extension";

const REGISTRY_MOD = "../../src/server/extensions/commands/registry";
const registryReal = { ...(await import(REGISTRY_MOD)) };

let command: BangCommand;
let lastContext: CommandContext | undefined;

const makeCommand = (
  declared?: string,
  result: Partial<CommandResult> = {},
): BangCommand => ({
  name: "Probe",
  description: "probe",
  trigger: "probe",
  ...(declared === undefined ? {} : { searchType: declared }),
  execute: async (_args, context) => {
    lastContext = context;
    return { title: "probe", html: "<p>probe</p>", ...result };
  },
});

let router: { request: (req: Request | string) => Response | Promise<Response> };

beforeAll(async () => {
  await initServerKey();
  mock.module(REGISTRY_MOD, () => ({
    ...registryReal,
    matchBangCommand: () => ({
      type: "command",
      command,
      commandId: "probe-command",
      args: "",
    }),
  }));
  router = (await import("../../src/server/routes/extensions/commands")).default;
});

afterAll(() => {
  mock.module(REGISTRY_MOD, () => registryReal);
});

const run = async (url = "http://localhost/api/command?q=!probe") => {
  const res = await router.request(url);
  expect(res.status).toBe(200);
  return res.json();
};

describe("command search types", () => {
  test("a command without a search type answers exactly as before", async () => {
    command = makeCommand();
    const body = await run();
    expect(body.type).toBe("command");
    expect("searchType" in body).toBe(false);
  });

  test("a command's declared search type is returned", async () => {
    command = makeCommand("images");
    expect((await run()).searchType).toBe("images");
  });

  test("a search type returned by execute wins over the declared one", async () => {
    command = makeCommand("images", { searchType: "videos" });
    expect((await run()).searchType).toBe("videos");
  });

  test.each([["../web"], ["images<script>"], [""], ["a b"]])("an invalid search type %p is dropped", async (bad) => {
    command = makeCommand(bad);
    expect("searchType" in (await run())).toBe(false);
  });

  test("execute receives the tab the search came from", async () => {
    command = makeCommand();
    await run("http://localhost/api/command?q=!probe&type=images");
    expect(lastContext?.searchType).toBe("images");
    await run("http://localhost/api/command?q=!probe&type=tab:engine:news");
    expect(lastContext?.searchType).toBe("news");
    await run();
    expect(lastContext?.searchType).toBe("web");
  });
});

describe("command results", () => {
  test("a command without results answers without a results field", async () => {
    command = makeCommand();
    expect("results" in (await run())).toBe(false);
  });

  test("results are kept in order, scored, and every thumbnail goes through the image proxy", async () => {
    command = makeCommand("images", {
      results: [
        { title: "One", url: "https://a.example/1", snippet: "s", source: "Probe", thumbnail: "http://192.168.1.5:8096/Items/1/Images/Primary", imageUrl: "https://cdn.example/1.jpg" },
        { title: "Two", url: "https://a.example/2", snippet: "", source: "" },
      ],
    });
    const body = await run();
    expect(body.results.map((r: { title: string }) => r.title)).toEqual(["One", "Two"]);
    expect(body.results[0].score).toBeGreaterThan(body.results[1].score);
    expect(body.results[0].thumbnail).toStartWith("/api/proxy/image?url=");
    expect(body.results[0].imageUrl).toStartWith("/api/proxy/image?url=");
    expect(body.results[1].source).toBe("Probe");
    expect(body.results[1].sources).toEqual(["Probe"]);
  });

  test("invalid results and unsafe image urls are dropped", async () => {
    command = makeCommand("images", {
      results: [
        { title: "", url: "https://a.example/1", snippet: "", source: "x" },
        { title: "Bad url", url: "javascript:alert(1)", snippet: "", source: "x" },
        { title: "Ok", url: "https://a.example/ok", snippet: "", source: "x", thumbnail: "/api/plugin/probe/thumb?id=1", imageUrl: "data:image/png;base64,AAAA" },
        null,
      ] as unknown as CommandResult["results"],
    });
    const body = await run();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe("Ok");
    expect(body.results[0].thumbnail).toBeUndefined();
    expect(body.results[0].imageUrl).toBeUndefined();
  });
});
