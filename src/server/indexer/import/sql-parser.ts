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

const unescapeCopy = (value: string): Cell => {
  if (value === "\\N") return null;
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = value[++i];
    if (next === undefined) {
      out += "\\";
    } else if (next === "t") {
      out += "\t";
    } else if (next === "n") {
      out += "\n";
    } else if (next === "r") {
      out += "\r";
    } else if (next === "\\") {
      out += "\\";
    } else {
      out += `\\${next}`;
    }
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
  sink: NamedRow[],
): number => {
  let i = startIdx;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === COPY_TERMINATOR) break;
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

const collectInserts = (
  sql: string,
  createCols: Map<string, string[]>,
  tables: ParsedTables,
): void => {
  const insertRe =
    /INSERT\s+INTO\s+([^\s(]+)\s*(\(([^)]*)\))?\s*VALUES\s*(.+?);\s*(?=INSERT|COPY|CREATE|$)/gis;
  let match: RegExpExecArray | null;
  while ((match = insertRe.exec(sql)) !== null) {
    const table = bareTable(match[1]);
    if (table !== URLS_TABLE && table !== HITS_TABLE) continue;

    const cols = match[3]
      ? splitColumns(match[3])
      : createCols.get(table);
    if (!cols || cols.length === 0) continue;

    const sink = table === URLS_TABLE ? tables.urls : tables.hits;
    for (const tuple of splitTuples(match[4])) {
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

const parseDump = (sql: string): ParsedTables => {
  const tables: ParsedTables = { urls: [], hits: [] };
  const createCols = readCreateCols(sql);

  const lines = sql.split(/\r?\n/);
  const copyRe = /^COPY\s+([^\s(]+)\s*\(([^)]*)\)\s+FROM\s+stdin/i;
  for (let i = 0; i < lines.length; i++) {
    const copy = lines[i].match(copyRe);
    if (!copy) continue;
    const table = bareTable(copy[1]);
    if (table !== URLS_TABLE && table !== HITS_TABLE) continue;
    const sink = table === URLS_TABLE ? tables.urls : tables.hits;
    i = readCopyBlock(lines, i + 1, splitColumns(copy[2]), sink);
  }

  collectInserts(sql, createCols, tables);
  return tables;
};

const num = (v: Cell): number | null => {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const required = (v: Cell): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const presentString = (v: Cell): string | null =>
  typeof v === "string" ? v : null;

const joinRows = (tables: ParsedTables): ExportRow[] => {
  const urlById = new Map<string, NamedRow>();
  for (const u of tables.urls) {
    if (u.id !== null && u.id !== undefined) urlById.set(String(u.id), u);
  }

  const rows: ExportRow[] = [];
  for (const h of tables.hits) {
    const url = urlById.get(String(h.url_id));
    const firstSeen = num(h.first_seen ?? null);
    const lastSeen = num(h.last_seen ?? null);
    const queryNorm = required(h.query_norm ?? null);
    const engineType = required(h.engine_type ?? null);
    const href = required(url?.url ?? null);
    const urlNorm = required(url?.url_norm ?? null);
    const sourceEngine = required(url?.source_engine ?? null);
    const title = presentString(url?.title ?? null);
    const snippet = presentString(url?.snippet ?? null);
    if (
      !url ||
      firstSeen === null ||
      lastSeen === null ||
      !queryNorm ||
      !engineType ||
      !href ||
      !urlNorm ||
      !sourceEngine ||
      title === null ||
      snippet === null
    ) {
      continue;
    }

    rows.push({
      query_norm: queryNorm,
      engine_type: engineType,
      url: href,
      url_norm: urlNorm,
      source_engine: sourceEngine,
      title,
      snippet,
      thumbnail: url.thumbnail ?? null,
      image_url: url.image_url ?? null,
      is_gif: num(url.is_gif ?? null),
      duration: url.duration ?? null,
      extras_json: url.extras_json ?? null,
      first_seen: firstSeen,
      last_seen: lastSeen,
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
    throw err;
  }
};
