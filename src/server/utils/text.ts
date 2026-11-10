
export const stripHtml = (text: string): string =>
  text
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const _CSS_BLOCK_RE =
  /(?:[.#][\w-]+\s*\{[^{}]*\}|@[^{]+\{(?:[^{}]|\{[^{}]*\})*\})\s*/g;

export const stripCssBlocks = (text: string): string =>
  text.replace(_CSS_BLOCK_RE, "").trim();

const _NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&", AMP: "&", lt: "<", LT: "<", gt: ">", GT: ">",
  quot: '"', QUOT: '"', apos: "'", nbsp: "\u00a0", shy: "\u00ad",
  ensp: "\u2002", emsp: "\u2003", thinsp: "\u2009",
  zwnj: "\u200c", zwj: "\u200d", lrm: "\u200e", rlm: "\u200f",
  middot: "\u00b7", bull: "\u2022", hellip: "\u2026", mdash: "\u2014", ndash: "\u2013",
  lsquo: "\u2018", rsquo: "\u2019", sbquo: "\u201a", ldquo: "\u201c", rdquo: "\u201d", bdquo: "\u201e",
  laquo: "\u00ab", raquo: "\u00bb", lsaquo: "\u2039", rsaquo: "\u203a", prime: "\u2032", Prime: "\u2033",
  copy: "\u00a9", COPY: "\u00a9", reg: "\u00ae", REG: "\u00ae", trade: "\u2122",
  deg: "\u00b0", times: "\u00d7", divide: "\u00f7", plusmn: "\u00b1", minus: "\u2212",
  frac12: "\u00bd", frac14: "\u00bc", frac34: "\u00be", sup2: "\u00b2", sup3: "\u00b3",
  euro: "\u20ac", pound: "\u00a3", yen: "\u00a5", cent: "\u00a2", sect: "\u00a7", para: "\u00b6",
  iexcl: "\u00a1", iquest: "\u00bf", larr: "\u2190", rarr: "\u2192", uarr: "\u2191", darr: "\u2193",
  harr: "\u2194", dagger: "\u2020", Dagger: "\u2021",
};

const _ENTITY_RE = /&(?:#(\d{1,7})|#[xX]([\da-fA-F]{1,6})|([A-Za-z][A-Za-z\d]{1,31}));/g;

const _fromCodePoint = (point: number): string | null =>
  point > 0 && point <= 0x10ffff && (point < 0xd800 || point > 0xdfff)
    ? String.fromCodePoint(point)
    : null;

export const decodeEntities = (text: string): string =>
  text.replace(
    _ENTITY_RE,
    (match, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (dec) return _fromCodePoint(Number.parseInt(dec, 10)) ?? match;
      if (hex) return _fromCodePoint(Number.parseInt(hex, 16)) ?? match;
      return name && Object.hasOwn(_NAMED_ENTITIES, name)
        ? _NAMED_ENTITIES[name]
        : match;
    },
  );

const _DATE_PREFIX =
  /^(?:\d{1,2}\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago/i;

export const stripSnippetPrefix = (text: string): string => {
  const stripped = text.replace(
    new RegExp(`^(?:${_DATE_PREFIX.source})\\s*[-–·]\\s*`, "i"),
    "",
  );
  return stripped || text;
};

const _DOCTYPE_KEYWORDS =
  /(?:(?:<!doctype|!doctype|doctype|octype|ctype|type|ype|pe|e)\s+)?(?:(?:(?:html|tml|ml|l)\s+)?(?:public|ublic|blic|lic|ic|c)\s+)?/;
const _PUBLIC_ID = /(["'])[+-]\/\/(?=[^"']*\/\/DTD\b)[^"']*/;
const _SYSTEM_ID = /["'][^"']*(?:$|["']\s*(?:>|$))/;

const _DOCTYPE_HEAD_RE = new RegExp(
  `^[\\s…]*${_DOCTYPE_KEYWORDS.source}${_PUBLIC_ID.source}(?:$|\\1\\s*(?:>|$|${_SYSTEM_ID.source}))`,
  "i",
);

export const startsWithDoctype = (text: string): boolean =>
  _DOCTYPE_HEAD_RE.test(text);

export const looksLikeProse = (text: string): boolean => {
  if (startsWithDoctype(text)) return false;
  if (/\{[^}]{0,500}\}/.test(text)) return false;
  const specialChars = (text.match(/[^a-zA-Z0-9\s.,!?'"()\-–-]/g) ?? []).length;
  const words = text.split(/\s+/).filter(Boolean);
  return specialChars / text.length < 0.1 && words.length >= 8;
};

const MONTH_INDEX: Readonly<Record<string, number>> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const AGO_MS: Readonly<Record<string, number>> = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_629_800_000,
  year: 31_557_600_000,
};

const _MONTH_NAMES = Object.keys(MONTH_INDEX).join("|");

const _ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;
const _MONTH_DAY_RE = new RegExp(
  `^(${_MONTH_NAMES})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})`,
  "i",
);
const _DAY_MONTH_RE = new RegExp(
  `^(\\d{1,2})\\s+(${_MONTH_NAMES})[a-z]*\\.?,?\\s+(\\d{4})`,
  "i",
);
const _AGO_RE = new RegExp(
  `^(\\d+)\\s+(${Object.keys(AGO_MS).join("|")})s?\\s+ago`,
  "i",
);
const _SEPARATOR_RE = /^\s*[-–—·:|]\s*/;

const _asIsoDay = (year: number, month: number, day: number): string | null => {
  const when = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(when.getTime())) return null;
  if (when.getUTCMonth() !== month || when.getUTCDate() !== day) return null;
  return when.toISOString().slice(0, 10);
};

const _matchDate = (text: string): { iso: string; length: number } | null => {
  const iso = _ISO_RE.exec(text);
  if (iso) {
    const day = _asIsoDay(+iso[1], +iso[2] - 1, +iso[3]);
    return day ? { iso: day, length: iso[0].length } : null;
  }

  const monthFirst = _MONTH_DAY_RE.exec(text);
  if (monthFirst) {
    const month = MONTH_INDEX[monthFirst[1].toLowerCase()];
    const day = _asIsoDay(+monthFirst[3], month, +monthFirst[2]);
    return day ? { iso: day, length: monthFirst[0].length } : null;
  }

  const dayFirst = _DAY_MONTH_RE.exec(text);
  if (dayFirst) {
    const month = MONTH_INDEX[dayFirst[2].toLowerCase()];
    const day = _asIsoDay(+dayFirst[3], month, +dayFirst[1]);
    return day ? { iso: day, length: dayFirst[0].length } : null;
  }

  const ago = _AGO_RE.exec(text);
  if (ago) {
    const back = Number(ago[1]) * AGO_MS[ago[2].toLowerCase()];
    if (!Number.isFinite(back)) return null;
    return {
      iso: new Date(Date.now() - back).toISOString().slice(0, 10),
      length: ago[0].length,
    };
  }

  return null;
};

const EARLIEST_PUBLISH_DATE = "1990-01-01";
const FUTURE_GRACE_MS = 2 * 86_400_000;

export const isPublishDate = (iso: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const when = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(when)) return false;
  if (new Date(when).toISOString().slice(0, 10) !== iso) return false;
  if (iso < EARLIEST_PUBLISH_DATE) return false;
  return when <= Date.now() + FUTURE_GRACE_MS;
};

interface SnippetDate {
  iso: string;
  rest: string;
}

export const snippetDate = (text: string): SnippetDate | null => {
  const trimmed = text.trimStart();
  const found = _matchDate(trimmed);
  if (!found || !isPublishDate(found.iso)) return null;
  const tail = trimmed.slice(found.length);
  const separator = _SEPARATOR_RE.exec(tail);
  if (!separator) return null;
  const rest = tail.slice(separator[0].length).trim();
  if (!rest) return null;
  return { iso: found.iso, rest };
};
