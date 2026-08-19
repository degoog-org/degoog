import type { ExportRow } from "../types/adapter";
import { logger } from "../../utils/logger";

const URLS_TABLE = "urls";
const HITS_TABLE = "query_hits";
const COPY_TERMINATOR = "\\.";

type Cell = string | null;
type NamedRow = Record<string, Cell>;

interface ParsedTables {
  urls: NamedRow[];
  hits: NamedRow[];
}

const stripQuotes = (name: string): string =>
  name.replace(/^["'`]|["'`]$/g, "");

const bareTable = (raw: string): string => {
  const last = raw.split(".").pop() ?? raw;
  return stripQuotes(last.trim()).toLowerCase();
};

const splitColumns = (list: string): string[] =>
  list
    .split(",")
    .map((c) => stripQuotes(c.trim()).toLowerCase())
    .filter(Boolean);

const COPY_ESCAPES: Record<string, string> = {
  t: "\t",
  n: "\n",
  r: "\r",
  "\\": "\\",
};

const unescapeCopy = (value: string): Cell => {
  if (value === "\\N") return null;
  let out = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "\\") {
      out += value[i];
      continue;
    }
    const next = value[i + 1];
    if (next === undefined) {
      out += "\\";
      break;
    }
    out += COPY_ESCAPES[next] ?? next;
    i++;
  }
  return out;
};

const namedFrom = (cols: string[], cells: Cell[]): NamedRow => {
  const row: NamedRow = {};
  cols.forEach((col, i) => {
    row[col] = cells[i] ?? null;
  });
  return row;
};

const readCopyBlock = (
  lines: string[],
  startIdx: number,
  cols: string[],
  sink: NamedRow[] | null,
): number => {
  let i = startIdx;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === COPY_TERMINATOR) break;
    if (!sink) continue;
    const cells = line.split("\t").map(unescapeCopy);
    sink.push(namedFrom(cols, cells));
  }
  return i;
};

const tokenizeTuple = (body: string): Cell[] => {
  const cells: Cell[] = [];
  let i = 0;
  const n = body.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(body[i])) i++;
    if (i >= n) break;

    if (body[i] === "'") {
      i++;
      let str = "";
      while (i < n) {
        if (body[i] === "'" && body[i + 1] === "'") {
          str += "'";
          i += 2;
        } else if (body[i] === "'") {
          i++;
          break;
        } else {
          str += body[i++];
        }
      }
      cells.push(str);
      continue;
    }

    let token = "";
    while (i < n && body[i] !== "," ) token += body[i++];
    const trimmed = token.trim();
    cells.push(/^null$/i.test(trimmed) ? null : trimmed);
  }
  return cells;
};

const splitTuples = (values: string): string[] => {
  const tuples: string[] = [];
  let depth = 0;
  let inStr = false;
  let start = -1;
  for (let i = 0; i < values.length; i++) {
    const ch = values[i];
    if (inStr) {
      if (ch === "'" && values[i + 1] === "'") i++;
      else if (ch === "'") inStr = false;
      continue;
    }
    if (ch === "'") {
      inStr = true;
    } else if (ch === "(") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0 && start >= 0) {
        tuples.push(values.slice(start, i));
        start = -1;
      }
    }
  }
  return tuples;
};

const QUOTES: Record<string, boolean> = { "'": true, '"': true, "`": true };

const skipQuoted = (sql: string, start: number, quote: string): number => {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] !== quote) {
      i++;
      continue;
    }
    if (sql[i + 1] === quote) {
      i += 2;
      continue;
    }
    return i + 1;
  }
  return i;
};

const skipComment = (sql: string, start: number): number => {
  if (sql[start] === "-" && sql[start + 1] === "-") {
    const end = sql.indexOf("\n", start);
    return end === -1 ? sql.length : end;
  }
  if (sql[start] === "/" && sql[start + 1] === "*") {
    const end = sql.indexOf("*/", start + 2);
    return end === -1 ? sql.length : end + 2;
  }
  return start;
};

const splitStatements = (sql: string): string[] => {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (QUOTES[ch]) {
      const end = skipQuoted(sql, i, ch);
      current += sql.slice(i, end);
      i = end;
      continue;
    }
    const afterComment = skipComment(sql, i);
    if (afterComment !== i) {
      current += " ";
      i = afterComment;
      continue;
    }
    i++;
    if (ch === "(") depth++;
    else if (ch === ")" && depth > 0) depth--;
    else if (ch === ";" && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.filter((s) => s.trim());
};

const INSERT_RE = /^\s*INSERT\s+INTO\s+([^\s(]+)\s*(?:\(([^)]*)\))?\s*VALUES\s*([\s\S]+)$/i;

const collectInserts = (
  statements: string[],
  createCols: Map<string, string[]>,
  tables: ParsedTables,
): void => {
  for (const statement of statements) {
    const match = INSERT_RE.exec(statement);
    if (!match) continue;

    const table = bareTable(match[1]);
    if (table !== URLS_TABLE && table !== HITS_TABLE) continue;

    const cols = match[2] ? splitColumns(match[2]) : createCols.get(table);
    if (!cols || cols.length === 0) continue;

    const sink = table === URLS_TABLE ? tables.urls : tables.hits;
    for (const tuple of splitTuples(match[3])) {
      sink.push(namedFrom(cols, tokenizeTuple(tuple)));
    }
  }
};

const readCreateCols = (sql: string): Map<string, string[]> => {
  const cols = new Map<string, string[]>();
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)\s*\(([\s\S]*?)\)\s*;/gi;
  let match: RegExpExecArray | null;
  while ((match = createRe.exec(sql)) !== null) {
    const table = bareTable(match[1]);
    if (table !== URLS_TABLE && table !== HITS_TABLE) continue;
    const names = match[2]
      .split(",")
      .map((line) => line.trim().split(/\s+/)[0])
      .map(stripQuotes)
      .map((c) => c.toLowerCase())
      .filter((c) => c && !/^(primary|unique|foreign|constraint|check|key)$/i.test(c));
    cols.set(table, names);
  }
  return cols;
};

const COPY_RE = /^COPY\s+([^\s(]+)\s*\(([^)]*)\)\s+FROM\s+stdin/i;

const sinkFor = (table: string, tables: ParsedTables): NamedRow[] | null => {
  if (table === URLS_TABLE) return tables.urls;
  if (table === HITS_TABLE) return tables.hits;
  return null;
};

const parseDump = (sql: string): ParsedTables => {
  const tables: ParsedTables = { urls: [], hits: [] };

  const lines = sql.split(/\r?\n/);
  const rest: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const copy = lines[i].match(COPY_RE);
    if (!copy) {
      rest.push(lines[i]);
      continue;
    }
    const sink = sinkFor(bareTable(copy[1]), tables);
    i = readCopyBlock(lines, i + 1, splitColumns(copy[2]), sink);
  }

  const statements = rest.join("\n");
  collectInserts(splitStatements(statements), readCreateCols(statements), tables);
  return tables;
};

const num = (v: Cell): number | null => {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const joinRows = (tables: ParsedTables): ExportRow[] => {
  const urlById = new Map<string, NamedRow>();
  for (const u of tables.urls) {
    if (u.id !== null && u.id !== undefined) urlById.set(String(u.id), u);
  }

  const rows: ExportRow[] = [];
  for (const h of tables.hits) {
    const url = urlById.get(String(h.url_id));
    if (!url || url.url_norm === null || url.url === null) continue;

    rows.push({
      query_norm: h.query_norm ?? "",
      engine_type: h.engine_type ?? "",
      url: url.url ?? "",
      url_norm: url.url_norm ?? "",
      source_engine: url.source_engine ?? "",
      title: url.title ?? "",
      snippet: url.snippet ?? "",
      thumbnail: url.thumbnail ?? null,
      image_url: url.image_url ?? null,
      is_gif: num(url.is_gif ?? null),
      duration: url.duration ?? null,
      extras_json: url.extras_json ?? null,
      first_seen: num(h.first_seen ?? null) ?? Date.now(),
      last_seen: num(h.last_seen ?? null) ?? Date.now(),
      source_instance: null,
      best_position: num(h.best_position ?? null),
      pos_sum: num(h.pos_sum ?? null),
      hit_count: num(h.hit_count ?? null),
      sources_json: h.sources_json ?? null,
      filters_json: h.filters_json ?? null,
      meta_json: h.meta_json ?? null,
    });
  }
  return rows;
};

export const parseSqlDump = (sql: string): ExportRow[] => {
  try {
    const tables = parseDump(sql);
    const rows = joinRows(tables);
    logger.info(
      "indexer",
      `sql-parser: parsed urls=${tables.urls.length} hits=${tables.hits.length} rows=${rows.length}`,
    );
    return rows;
  } catch (err) {
    logger.warn("indexer", "sql-parser: failed to parse dump", err);
    return [];
  }
};
