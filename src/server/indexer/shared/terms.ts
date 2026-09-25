const MIN_PREFIX_LEN = 3;
export const FUZZY_CANDIDATE_CAP = 10000;
const PUNCTUATION = /[^a-z0-9-]/g;
const EDGE_DASHES = /^-+|-+$/g;
const ALPHANUMERIC = /[a-z0-9]/;

interface IndexTerm {
  raw: string;
  token: string;
  word: RegExp;
}

const stripTerm = (s: string): string =>
  s.replace(PUNCTUATION, "").replace(EDGE_DASHES, "");

export const splitTerms = (queryNorm: string): IndexTerm[] =>
  queryNorm
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, token: stripTerm(raw) }))
    .filter((t) => ALPHANUMERIC.test(t.token))
    .map((t) => ({
      ...t,
      word: new RegExp(`(^|[^a-z0-9])${t.token}([^a-z0-9]|$)`),
    }));

export const canPrefix = (term: IndexTerm): boolean =>
  term.token.length >= MIN_PREFIX_LEN;

export const termHit = (text: string, term: IndexTerm): boolean =>
  text.includes(term.raw) || term.word.test(text);
