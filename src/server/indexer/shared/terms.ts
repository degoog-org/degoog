export const MIN_PREFIX_LEN = 3;
export const FUZZY_CANDIDATE_CAP = 10000;
export const FTS_SCAN_CAP = 2000;

const PUNCTUATION = /[^\p{L}\p{N}-]/gu;
const EDGE_DASHES = /^-+|-+$/g;
const WORD_SPLIT = /[\s_]+/;
const ALPHANUMERIC = /[\p{L}\p{N}]/u;
const BOUNDARY = "[^\\p{L}\\p{N}]";

export interface IndexTerm {
  raw: string;
  token: string;
  word: RegExp;
}

const stripTerm = (s: string): string =>
  s.replace(PUNCTUATION, "").replace(EDGE_DASHES, "");

export const splitTerms = (queryNorm: string): IndexTerm[] =>
  queryNorm
    .split(WORD_SPLIT)
    .filter(Boolean)
    .map((raw) => ({ raw, token: stripTerm(raw) }))
    .filter((t) => ALPHANUMERIC.test(t.token))
    .map((t) => ({
      ...t,
      word: new RegExp(`(^|${BOUNDARY})${t.token}(${BOUNDARY}|$)`, "u"),
    }));

export const canPrefix = (term: IndexTerm): boolean =>
  term.token.length >= MIN_PREFIX_LEN;

export const termHit = (text: string, term: IndexTerm): boolean =>
  text.includes(term.raw) || term.word.test(text);
