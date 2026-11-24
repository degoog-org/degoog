const MIN_PREFIX_LEN = 3;
export const FUZZY_CANDIDATE_CAP = 10000;
export const SUBSTRING_SCAN_WINDOW = 50000;
export const MAX_SUBSTRING_NEEDLES = 8;
const SEPARATORS = /[^\p{L}\p{N}\p{M}-]+/gu;
const EDGE_DASHES = /(^|\s)-+|-+(\s|$)/g;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const MARKS = /\p{M}/gu;
const ACCENT_FOLDED_SCRIPT = /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;
const UNSPACED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

export interface IndexTerm {
  raw: string;
  token: string;
  needle: string;
  prefix: boolean;
  unspaced: boolean;
}

const tokenize = (s: string): string =>
  s
    .replace(SEPARATORS, " ")
    .replace(EDGE_DASHES, "$1$2")
    .replace(/\s+/g, " ")
    .trim();

export const escapeLike = (s: string): string =>
  s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

export const stripAccents = (s: string): string =>
  Array.from(s.normalize("NFC"), (ch) => {
    const decomposed = ch.normalize("NFKD");
    return ACCENT_FOLDED_SCRIPT.test(decomposed)
      ? decomposed.replace(MARKS, "").normalize("NFC")
      : ch;
  }).join("");

export const foldText = (s: string): string =>
  stripAccents(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim();

export const hasUnspacedScript = (s: string): boolean => UNSPACED_SCRIPT.test(s);

const allowsPrefix = (token: string): boolean => {
  const chars = [...token.replace(/\s/g, "")];
  if (hasUnspacedScript(token)) return chars.length > 0;
  return chars.length >= MIN_PREFIX_LEN;
};

export const splitTerms = (queryNorm: string): IndexTerm[] =>
  queryNorm
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, token: tokenize(raw) }))
    .filter((t) => WORD_CHAR.test(t.token))
    .map((t) => ({
      ...t,
      needle: foldText(t.token),
      prefix: allowsPrefix(t.token),
      unspaced: hasUnspacedScript(t.token),
    }))
    .filter((t) => t.needle.length > 0);

export const canPrefix = (term: IndexTerm): boolean => term.prefix;

export const termHit = (text: string, term: IndexTerm): boolean => {
  if (text.includes(term.raw)) return true;
  const folded = foldText(text);
  if (term.unspaced) return folded.includes(term.needle);
  const haystack = ` ${folded} `;
  return haystack.includes(term.prefix ? ` ${term.needle}` : ` ${term.needle} `);
};
