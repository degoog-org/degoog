import { Hono } from "hono";
import { asBoolean } from "../../../utils/settings/plugin-settings";
import { readObjectBody } from "../../../utils/hono";
import { getInstanceSettings } from "../../../utils/settings/server-settings";
import { readDomainLists, writeDomainList } from "../../../utils/filtering/domain-lists";
import { settingsAuth } from "../../_guards";

const router = new Hono();

const _normalizeHostname = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

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
  replace: {
    flag: "domainReplaceUiEnabled",
    list: "domainReplaceList",
    edit: (existing, source, body) => {
      const target = _normalizeHostname(body.target ?? "");
      if (!target) return { error: "Missing target" };
      return _upsertKeyed(existing, source, "->", `${source} -> ${target}`);
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

  const source = _normalizeHostname(body.source ?? "");
  if (!source) return c.json({ error: "Missing source" }, 400);

  const kind = body.kind ?? "";
  if (!Object.hasOwn(DOMAIN_ACTIONS, kind)) return c.json({ error: "Invalid kind" }, 400);
  const action = DOMAIN_ACTIONS[kind];

  const existing = await getInstanceSettings();
  if (!asBoolean(existing[action.flag])) return c.json({ error: "Forbidden" }, 403);

  const next = action.edit((await readDomainLists())[action.list], source, body);
  if (typeof next !== "string") return c.json(next, 400);
  await writeDomainList(action.list, next);
  return c.json({ ok: true });
});

export default router;
