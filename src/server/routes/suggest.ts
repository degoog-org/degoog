import { Hono } from "hono";
import type { SuggestPostBody } from "../types/search";

const router = new Hono();

async function getSuggestions(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  const encoded = encodeURIComponent(query);
  const [googleRes, ddgRes] = await Promise.allSettled([
    fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&q=${encoded}`,
    )
      .then((r) => r.arrayBuffer())
      .then((buf) => JSON.parse(new TextDecoder("iso-8859-1").decode(buf))),
    fetch(`https://duckduckgo.com/ac/?q=${encoded}&type=list`).then((r) =>
      r.json(),
    ),
  ]);
  const googleSuggestions: string[] =
    googleRes.status === "fulfilled"
      ? (googleRes.value as [unknown, string[]])[1] || []
      : [];
  const ddgSuggestions: string[] =
    ddgRes.status === "fulfilled"
      ? (ddgRes.value as [unknown, string[]])[1] || []
      : [];

  const seen = new Set<string>();
  const merged: string[] = [];
  const lower = query.toLowerCase();
  for (const s of [...googleSuggestions, ...ddgSuggestions]) {
    const key = String(s).toLowerCase();
    if (key !== lower && !seen.has(key)) {
      seen.add(key);
      merged.push(String(s));
    }
    if (merged.length >= 10) break;
  }
  return merged;
}

router.get("/api/suggest", async (c) => {
  const query = c.req.query("q") ?? "";
  return c.json(await getSuggestions(query));
});

router.post("/api/suggest", async (c) => {
  const { query } = await c.req.json<SuggestPostBody>();
  return c.json(await getSuggestions(query ?? ""));
});

router.get("/api/suggest/opensearch", async (c) => {
  const query = c.req.query("q") ?? "";
  const suggestions = await getSuggestions(query);
  return c.json([query, suggestions], 200, {
    "Content-Type": "application/x-suggestions+json",
  });
});

export default router;
