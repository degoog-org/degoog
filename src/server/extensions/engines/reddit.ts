import type {
  SearchEngine,
  SearchResult,
  TimeFilter,
  EngineContext,
} from "../../types";
import { getRandomUserAgent } from "../../utils/user-agents";

export class RedditEngine implements SearchEngine {
  name = "Reddit";
  bangShortcut = "r";

  async executeSearch(
    query: string,
    page: number = 1,
    timeFilter?: TimeFilter,
    context?: EngineContext,
  ): Promise<SearchResult[]> {
    const limit = 25;
    const t = this.mapTimeFilter(timeFilter);
    const params = new URLSearchParams({
      q: query,
      type: "link",
      sort: "relevance",
      t,
      limit: String(limit),
    });
    if (page > 1) {
      params.set("count", String((page - 1) * limit));
    }

    const url = `https://www.reddit.com/search.json?${params.toString()}`;
    const doFetch = context?.fetch ?? fetch;
    const response = await doFetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        Accept: "application/json, text/plain, */*",
        "Accept-Language":
          context?.buildAcceptLanguage?.() ||
          process.env.DEGOOG_DEFAULT_SEARCH_LANGUAGE ||
          "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      },
    });
    const data = (await response.json()) as {
      data: {
        children: Array<{
          data: {
            title: string;
            permalink: string;
            selftext: string;
            subreddit_name_prefixed: string;
            url: string;
            thumbnail?: string;
            is_self: boolean;
          };
        }>;
      };
    };

    const results: SearchResult[] = [];

    for (const child of data.data.children) {
      const post = child.data;
      const title = post.title;
      const postUrl = `https://www.reddit.com${post.permalink}`;
      const snippet = post.selftext
        ? post.selftext.substring(0, 200)
        : post.subreddit_name_prefixed;

      if (title) {
        results.push({
          title,
          url: postUrl,
          snippet,
          source: this.name,
        });
      }
    }

    return results;
  }

  private mapTimeFilter(timeFilter?: TimeFilter): string {
    if (!timeFilter || timeFilter === "any") return "all";
    return timeFilter;
  }
}
