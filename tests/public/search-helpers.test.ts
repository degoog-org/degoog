import { describe, test, expect } from "bun:test";
import { getNaturalLanguageBangQuery } from "../../src/client/utils/search-helpers";
import type { Command } from "../../src/client/types/extension";

const makeCmd = (trigger: string, opts: Partial<Command> = {}): Command => ({
  id: trigger,
  trigger,
  naturalLanguage: true,
  aliases: [],
  naturalLanguagePhrases: [],
  ...opts,
});

describe("getNaturalLanguageBangQuery", () => {
  test("matches triggers, aliases and phrases, keeping the trailing query", () => {
    const cmd = makeCmd("ip", {
      aliases: ["myip"],
      naturalLanguagePhrases: ["my ip address", "my ip", "lookup ip"],
    });
    const cases: [string, string][] = [
      ["ip", "!ip"],
      ["IP", "!ip"],
      ["ip 1.2.3.4", "!ip 1.2.3.4"],
      ["myip", "!ip"],
      ["my ip", "!ip"],
      ["my ip address", "!ip"],
      ["lookup ip 8.8.8.8", "!ip 8.8.8.8"],
    ];
    for (const [query, expected] of cases) {
      expect(getNaturalLanguageBangQuery(query, [cmd])).toBe(expected);
    }
  });

  test("returns null for blank queries, misses and ineligible commands", () => {
    expect(getNaturalLanguageBangQuery("", [makeCmd("ip")])).toBeNull();
    expect(getNaturalLanguageBangQuery("   ", [makeCmd("ip")])).toBeNull();
    expect(getNaturalLanguageBangQuery("weather", [makeCmd("ip")])).toBeNull();
    expect(
      getNaturalLanguageBangQuery("ip", [makeCmd("ip", { naturalLanguage: false })]),
    ).toBeNull();
    const noId = { ...makeCmd("ip"), id: undefined } as unknown as Command;
    expect(getNaturalLanguageBangQuery("ip", [noId])).toBeNull();
  });
});
