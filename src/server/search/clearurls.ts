// ClearURLs rules, applied on top of the static TRACKING_PARAMS list in url-normalize.ts.
//
// The static list covers ad-click identifiers (gclid, fbclid, msclkid...) and the utm_ prefix, which
// is most of what a search result carries. It does not cover site-specific tracking, which is where
// the rest lives: Amazon's ref and pd_rd_*, eBay's _trksid, LinkedIn's trk, Spotify's si. ClearURLs
// is the maintained community ruleset for exactly that, 206 providers and 733 rules, and it also
// unwraps redirector links so a result points at its real destination.
//
// The ruleset is vendored, not fetched. degoog does not depend on a third-party host at runtime, and
// this ruleset gives no reason to make an exception: upstream changed it once in the last twelve
// months, so a refresh is a reviewed one-file swap rather than a daily request from every instance.
//
// Source:  https://github.com/ClearURLs/Rules (data.minify.json, gh-pages branch)
// Commit:  38cbb480d353f1a23cbacbc4981c5f77d9363cd2, 2026-03-25
// Licence: LGPL-3.0-or-later, https://github.com/ClearURLs/Rules/blob/master/LICENSE
//
// clearurls-rules.json is that file byte for byte. Keep it that way, so refreshing it stays a diff
// against upstream instead of a merge with local edits.

import { logger } from "../utils/logger";

import rulesData from "./clearurls-rules.json";

interface ClearUrlsProvider {
  urlPattern: string;
  completeProvider?: boolean;
  rules?: string[];
  rawRules?: string[];
  referralMarketing?: string[];
  exceptions?: string[];
  redirections?: string[];
}

interface CompiledProvider {
  urlPattern: RegExp;
  rules: RegExp[];
  rawRules: RegExp[];
  exceptions: RegExp[];
  redirections: RegExp[];
}

// ClearURLs anchors every rule as a whole-value match. Compiling once at load keeps the hot path to
// a regex test per provider rather than a construction per URL.
/** Compile the raw provider map into regexes once, so the hot path is a test per provider. */
const _compile = (raw: Record<string, ClearUrlsProvider>): CompiledProvider[] => {
  const out: CompiledProvider[] = [];
  for (const [name, p] of Object.entries(raw)) {
    if (!p?.urlPattern) continue;
    try {
      out.push({
        urlPattern: new RegExp(p.urlPattern, "i"),
        // referralMarketing entries are stripped too: they are tracking parameters that happen to
        // pay someone, which is not a reason to keep them in a search result.
        rules: [...(p.rules ?? []), ...(p.referralMarketing ?? [])].map(
          (r) => new RegExp(`^${r}$`, "i"),
        ),
        // Global: a rawRule strips a pattern from the whole URL, and the same pattern can occur
        // more than once. Without "g" only the first occurrence goes.
        rawRules: (p.rawRules ?? []).map((r) => new RegExp(r, "gi")),
        exceptions: (p.exceptions ?? []).map((r) => new RegExp(r, "i")),
        redirections: (p.redirections ?? []).map((r) => new RegExp(r, "i")),
      });
    } catch (err) {
      // One malformed provider must not cost the other 205.
      logger.debug("search", `clearurls: skipping provider "${name}"`, err);
    }
  }
  return out;
};

// Compiled once at import: 206 regex constructions, paid at startup rather than per search.
let _providers: CompiledProvider[] = _compile(
  rulesData.providers as Record<string, ClearUrlsProvider>,
);

/** Test seam: swap the vendored ruleset for a fixture. */
export function loadClearUrlsForTest(raw: Record<string, ClearUrlsProvider>): void {
  _providers = _compile(raw);
}

/**
 * Apply the ClearURLs ruleset to a single URL.
 *
 * Returns the input unchanged when no provider matches, when no rules are loaded, or when
 * anything throws. Cleaning is best-effort by design: a bad rule must never cost the result.
 */
export const applyClearUrls = (url: string): string => {
  if (_providers.length === 0) return url;
  let current = url;
  // A redirector can wrap another redirector. Bounded so a malformed rule cannot spin.
  for (let hop = 0; hop < 3; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return current;
    }
    let redirected: string | null = null;
    for (const p of _providers) {
      if (!p.urlPattern.test(current)) continue;
      if (p.exceptions.some((e) => e.test(current))) continue;

      for (const r of p.redirections) {
        const m = current.match(r);
        if (m?.[1]) {
          let candidate: string;
          try {
            candidate = decodeURIComponent(m[1]);
          } catch {
            candidate = m[1];
          }
          // A redirection rule pulls its target OUT of the URL, so the target is
          // attacker-influenced: whoever controls the result controls what comes back. Restrict it
          // to http and https before returning it. HTML escaping does not neutralise javascript: or
          // data:, and not every render path funnels through the same link helper.
          try {
            const resolved = new URL(candidate, current);
            if (resolved.protocol === "http:" || resolved.protocol === "https:") {
              redirected = resolved.href;
            }
          } catch {
            // Not a URL. Leave the current value alone rather than unwrapping to something unusable.
          }
          break;
        }
      }
      if (redirected) break;

      for (const key of Array.from(parsed.searchParams.keys())) {
        if (p.rules.some((r) => r.test(key))) parsed.searchParams.delete(key);
      }
      for (const raw of p.rawRules) {
        // A rawRule operates on the whole URL, so it can cut out something structural and leave a
        // string that is no longer a URL. Keep the last valid value rather than throwing: an
        // exception here would abandon cleaning for this result entirely.
        const rewritten = parsed.href.replace(raw, "");
        try {
          parsed = new URL(rewritten);
        } catch {
          logger.debug("search", `clearurls: rawRule produced an invalid url, skipping it`);
        }
      }
    }
    if (!redirected) return parsed.href;
    current = redirected;
  }
  return current;
};
