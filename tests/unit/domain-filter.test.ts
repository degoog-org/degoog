import { describe, test, expect, beforeEach, afterEach, afterAll } from "bun:test";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const settingsFile = join(tmpdir(), `degoog-df-settings-${Date.now()}.json`);
const listsFile = join(tmpdir(), `degoog-df-lists-${Date.now()}.json`);
const _originalSettingsFile = process.env.DEGOOG_SERVER_SETTINGS_FILE;
const _originalListsFile = process.env.DEGOOG_SEARCH_LISTS_FILE;
process.env.DEGOOG_SERVER_SETTINGS_FILE = settingsFile;
process.env.DEGOOG_SEARCH_LISTS_FILE = listsFile;

import {
  applyDomainReplacements,
  filterBlockedDomains,
} from "../../src/server/utils/domain-filter";
import { writeDomainList } from "../../src/server/utils/domain-lists";
import { clearServerSettingsCache } from "../../src/server/utils/server-settings";
import {
  INVALIDATE_SCOPE,
  publishInvalidate,
} from "../../src/server/utils/cache-valkey";
import type { ScoredResult } from "../../src/server/types";

const result = (url: string): ScoredResult =>
  ({ title: "t", url, snippet: "", source: "test", score: 1 }) as ScoredResult;

const seedSettings = async (settings: Record<string, unknown>): Promise<void> => {
  await writeFile(
    settingsFile,
    JSON.stringify({ wizard: true, instanceId: "test", settings }),
  );
  clearServerSettingsCache();
  await publishInvalidate(INVALIDATE_SCOPE.SERVER_SETTINGS);
};

const wipe = async (): Promise<void> => {
  await unlink(settingsFile).catch(() => {});
  await unlink(listsFile).catch(() => {});
  clearServerSettingsCache();
  await publishInvalidate(INVALIDATE_SCOPE.SERVER_SETTINGS);
};

beforeEach(wipe);
afterEach(wipe);
afterAll(() => {
  if (_originalSettingsFile === undefined) delete process.env.DEGOOG_SERVER_SETTINGS_FILE;
  else process.env.DEGOOG_SERVER_SETTINGS_FILE = _originalSettingsFile;
  if (_originalListsFile === undefined) delete process.env.DEGOOG_SEARCH_LISTS_FILE;
  else process.env.DEGOOG_SEARCH_LISTS_FILE = _originalListsFile;
});

describe("domain replacements", () => {
  test("rewrites the hostname of matching results and subdomains", async () => {
    await seedSettings({
      domainReplaceEnabled: true,
      domainReplaceList: "reddit.com -> redlib.example.com",
    });

    const out = await applyDomainReplacements([
      result("https://www.reddit.com/r/selfhosted/comments/1"),
      result("https://example.org/page"),
    ]);

    expect(new URL(out[0].url).hostname).toBe("redlib.example.com");
    expect(new URL(out[0].url).pathname).toBe("/r/selfhosted/comments/1");
    expect(out[1].url).toBe("https://example.org/page");
  });

  test("picks up list edits without a restart", async () => {
    await seedSettings({ domainReplaceEnabled: true, domainReplaceList: "" });

    const before = await applyDomainReplacements([
      result("https://www.reddit.com/r/selfhosted"),
    ]);
    expect(new URL(before[0].url).hostname).toBe("www.reddit.com");

    await writeDomainList("domainReplaceList", "reddit.com -> redlib.example.com");

    const after = await applyDomainReplacements([
      result("https://www.reddit.com/r/selfhosted"),
    ]);
    expect(new URL(after[0].url).hostname).toBe("redlib.example.com");
  });

  test("picks up block list edits without a restart", async () => {
    await seedSettings({ domainBlockEnabled: true, domainBlockList: "" });

    expect(await filterBlockedDomains([result("https://spam.example/x")])).toHaveLength(1);

    await writeDomainList("domainBlockList", "spam.example");

    expect(await filterBlockedDomains([result("https://spam.example/x")])).toHaveLength(0);
  });
});
