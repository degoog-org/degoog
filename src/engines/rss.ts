import type { SearchEngine, SearchResult, SettingField, TimeFilter } from "../types";
import { searchNews, DEFAULT_NEWS_FEED_URLS } from "../news-rss";

export class RssNewsEngine implements SearchEngine {
  name = "RSS Feeds";

  settingsSchema: SettingField[] = [
    {
      key: "urls",
      label: "Feed URLs",
      type: "textarea",
      description:
        "One RSS/Atom feed URL per line. Leave empty to use default tech news feeds.",
      placeholder: "https://news.ycombinator.com/rss\nhttps://techcrunch.com/feed/",
    },
  ];

  private feedUrls: string[] = [...DEFAULT_NEWS_FEED_URLS];

  configure(settings: Record<string, string>): void {
    const raw = (settings.urls ?? "").trim();
    if (!raw) {
      this.feedUrls = [...DEFAULT_NEWS_FEED_URLS];
      return;
    }
    const parsed = raw
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => {
        try {
          return u.startsWith("http") && !!new URL(u);
        } catch {
          return false;
        }
      });
    this.feedUrls = parsed.length > 0 ? parsed : [...DEFAULT_NEWS_FEED_URLS];
  }

  async executeSearch(
    query: string,
    page: number = 1,
    _timeFilter?: TimeFilter,
  ): Promise<SearchResult[]> {
    return searchNews(query, page, this.feedUrls);
  }
}
