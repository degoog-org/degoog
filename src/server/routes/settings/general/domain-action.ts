import { Hono } from "hono";
import { asBoolean } from "../../../utils/settings/plugin-settings";
import { readObjectBody } from "../../../utils/hono";
import { getInstanceSettings } from "../../../utils/settings/server-settings";
import { readDomainLists, writeDomainList } from "../../../utils/filtering/domain-lists";
import { buildFaviconUrl } from "../../../utils/net/proxy-sign";
import { settingsAuth } from "../../_guards";
import { settingsLock } from "../../../utils/settings/settings-write";
import { parseRedirectList, toRedirectLine } from "../../../../shared/redirects/redirect-rules";
import { normalizeHostname, toBareHost } from "../../../../shared/redirects/redirect-match";

const router = new Hono();

const _splitLines = (raw: string): string[] =>
  raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

const _appendBlock = (existing: string, source: string): string => {
  const lines = _splitLines(existing);
  if (lines.includes(source)) return existing;
  lines.push(source);
  return lines.join("\n");
};

const _upsertKeyed = (existing: string, source: string, sep: string, line: string): string => {
  const next = _splitLines(existing).filter((l) => l.split(sep)[0].trim() !== source);
  next.push(line);
  return next.join("\n");
};

const _redirectMatchOf = (line: string): string | null =>
  parseRedirectList(line).rules[0]?.match ?? null;

const _upsertRedirect = (existing: string, source: string, target: string): string => {
  const next = _splitLines(existing).filter((line) => {
    const match = _redirectMatchOf(line);
    return match === null || normalizeHostname(match.trim()) !== source;
  });
  next.push(toRedirectLine({ match: source, replace: target }));
  return next.join("\n");
};

const REPLACE_KIND = "replace";

type DomainActionBody = { kind?: string; source?: string; target?: string; score?: number };

const DOMAIN_ACTIONS: Record<
  string,
  {
    flag: string;
    list: Parameters<typeof writeDomainList>[0];
    edit: (existing: string, source: string, body: DomainActionBody) => string | { error: string };
  }
> = {
  block: {
    flag: "domainBlockUiEnabled",
    list: "domainBlockList",
    edit: (existing, source) => _appendBlock(existing, source),
  },
  [REPLACE_KIND]: {
    flag: "domainReplaceUiEnabled",
    list: "domainReplaceList",
    edit: (existing, source, body) => {
      const target = toBareHost(body.target ?? "");
      if (!target) return { error: "Missing target" };
      return _upsertRedirect(existing, source, target);
    },
  },
  score: {
    flag: "domainScoreUiEnabled",
    list: "domainScoreList",
    edit: (existing, source, body) => {
      const score = Number(body.score);
      if (!Number.isFinite(score)) return { error: "Invalid score" };
      return _upsertKeyed(existing, source, "|", `${source}|${Math.trunc(score)}`);
    },
  },
};

router.post("/api/settings/domain-action", settingsAuth("POST /api/settings/domain-action"), async (c) => {
  const body = await readObjectBody<DomainActionBody>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);

  const source = toBareHost(body.source ?? "");
  if (!source) return c.json({ error: "Missing source" }, 400);

  const kind = body.kind ?? "";
  if (!Object.hasOwn(DOMAIN_ACTIONS, kind)) return c.json({ error: "Invalid kind" }, 400);
  const action = DOMAIN_ACTIONS[kind];

  const existing = await getInstanceSettings();
  if (!asBoolean(existing[action.flag])) return c.json({ error: "Forbidden" }, 403);

  const next = await settingsLock(async () => {
    const edited = action.edit((await readDomainLists())[action.list], source, body);
    if (typeof edited === "string") await writeDomainList(action.list, edited);
    return edited;
  });
  if (typeof next !== "string") return c.json(next, 400);
  if (kind === REPLACE_KIND) {
    return c.json({ ok: true, favicon: buildFaviconUrl(toBareHost(body.target ?? "")) });
  }
  return c.json({ ok: true });
});

export default router;
