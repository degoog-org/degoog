import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
} from "../../types";

const _wikimediaHeaders: Record<string, string> = {
  "User-Agent": "degoog/1.0 (+https://github.com/fccview/degoog)",
  "Api-User-Agent": "degoog/1.0 (+https://github.com/fccview/degoog)",
};

export class WikipediaEngine implements SearchEngine {
  name = "Wikipedia";
  bangShortcut = "w";

  async executeSearch(
    query: string,
    page?: number,
    _timeFilter?: TimeFilter,
    context?: EngineContext,
  ): Promise<SearchResult[]> {
    const q = query.trim();
    if (!q) return [];

    const offset = ((page || 1) - 1) * 15;
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=15&sroffset=${offset}&utf8=1`;
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: _wikimediaHeaders,
    });
    if (!response.ok) return [];

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return [];
    }

    const payload = data as {
      query?: {
        search?: Array<{ title: string; snippet?: string; pageid: number }>;
      };
      error?: { info?: string };
    };

    if (payload.error) return [];

    const items = payload.query?.search;
    if (!Array.isArray(items)) return [];

    const results: SearchResult[] = [];

    for (const item of items) {
      const snippet = (item.snippet ?? "").replace(/<[^>]+>/g, "").trim();
      results.push({
        title: item.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
        snippet,
        source: this.name,
      });
    }

    return results;
  }
}
