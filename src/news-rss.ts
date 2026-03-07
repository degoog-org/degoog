import * as cheerio from "cheerio";
import type { SearchResult } from "./types";
import { debug } from "./logger";
import { getSettings, setSettings } from "./plugin-settings";

const NEWS_RSS_SETTINGS_ID = "news-rss";
const URLS_KEY = "urls";

const FEED_TIMEOUT_MS = 10_000;

/**
 * @fccview here!
 * I have tried to add as many news feeds as possible by default.
 * This is a list of tech feed given to me by gemini and feels quite comprehensive to use.
 *
 * You can remove them all from your setting tabs and add your own.
 */
export const DEFAULT_NEWS_FEED_URLS = [
  "https://news.ycombinator.com/rss",
  "https://techcrunch.com/feed/",
  "https://feeds.arstechnica.com/arstechnica/index",
  "https://www.wired.com/feed/rss",
  "https://feeds.bbci.co.uk/news/technology/rss.xml",
  "https://www.theverge.com/rss/index.xml",
  "https://www.engadget.com/rss.xml",
  "https://www.cnet.com/rss/news/",
  "https://www.zdnet.com/news/rss.xml",
  "https://gizmodo.com/rss",
  "https://www.technologyreview.com/feed/",
  "https://readwrite.com/feed/",
  "https://venturebeat.com/feed/",
  "https://thenextweb.com/feed/",
];

export interface RssItem {
  title: string;
  url: string;
  description: string;
  source: string;
  pubDate: Date | null;
  thumbnail?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CONCURRENCY = 5;
const MAX_ITEMS_PER_FEED = 50;
const MAX_CACHE_ENTRIES = 100;

const cache = new Map<
  string,
  { items: RssItem[]; feedTitle: string; fetchedAt: number }
>();

function parseRssOrAtom(
  xml: string,
  feedUrl: string,
): { items: RssItem[]; feedTitle: string } {
  try {
    return parseRssOrAtomInner(xml, feedUrl);
  } catch {
    return { items: [], feedTitle: new URL(feedUrl).hostname };
  }
}

function parseRssOrAtomInner(
  xml: string,
  feedUrl: string,
): { items: RssItem[]; feedTitle: string } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const feedTitle =
    $("channel > title").first().text().trim() ||
    $("feed > title").first().text().trim() ||
    new URL(feedUrl).hostname;
  const items: RssItem[] = [];

  $("channel > item, feed > entry").each((_, el) => {
    const $el = $(el);
    const title =
      $el.find("title").first().text().trim() ||
      $el.find("content").first().text().trim().slice(0, 200);
    let link =
      $el.find("link").first().attr("href") ||
      $el.find("link").first().text().trim();
    if (!link && $el.find("link").length) {
      const linkEl = $el.find("link").first();
      if (linkEl.attr("href")) link = linkEl.attr("href")!;
      else link = linkEl.text().trim();
    }
    const desc =
      $el.find("description").first().text().trim() ||
      $el.find("summary").first().text().trim() ||
      $el.find("content").first().text().trim() ||
      "";
    const pubDateStr =
      $el.find("pubDate").first().text().trim() ||
      $el.find("published").first().text().trim() ||
      $el.find("updated").first().text().trim() ||
      "";
    let pubDate: Date | null = null;
    if (pubDateStr) {
      try {
        pubDate = new Date(pubDateStr);
        if (Number.isNaN(pubDate.getTime())) pubDate = null;
      } catch {
        pubDate = null;
      }
    }
    let thumbnail: string | undefined;

    const mediaImages = $el.find("media\\:content").filter(function () {
      return (
        $(this).attr("medium") === "image" ||
        /\.(jpe?g|png|webp|gif)/i.test($(this).attr("url") || "")
      );
    });

    if (mediaImages.length) {
      let bestUrl = mediaImages.first().attr("url") || "";
      let bestWidth =
        parseInt(mediaImages.first().attr("width") || "0", 10) || 0;
      mediaImages.each(function () {
        const w = parseInt($(this).attr("width") || "0", 10) || 0;
        if (w > bestWidth) {
          bestWidth = w;
          bestUrl = $(this).attr("url") || "";
        }
      });
      if (bestUrl && bestUrl.startsWith("http")) thumbnail = bestUrl;
    }

    if (!thumbnail) {
      const mediaThumb = $el.find("media\\:thumbnail").first();
      if (mediaThumb.length) {
        const url = mediaThumb.attr("url");
        if (url && url.startsWith("http")) thumbnail = url;
      }
    }

    if (!thumbnail) {
      const enclosure = $el
        .find("enclosure")
        .filter(function () {
          const t = $(this).attr("type") || "";
          return t.startsWith("image/");
        })
        .first();
      if (enclosure.length) {
        const encUrl = enclosure.attr("url");
        if (encUrl && encUrl.startsWith("http")) thumbnail = encUrl;
      }
    }

    if (!thumbnail) {
      const htmlContent =
        $el.find("content\\:encoded").first().text() ||
        $el.find("description").first().text() ||
        $el.find("content").first().text() ||
        "";
      const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1] && imgMatch[1].startsWith("http")) {
        thumbnail = imgMatch[1];
      }
    }
    if (title && link && link.startsWith("http")) {
      items.push({
        title,
        url: link,
        description: desc.replace(/<[^>]+>/g, "").slice(0, 500),
        source: feedTitle,
        pubDate,
        thumbnail,
      });
    }
  });

  return { items: items.slice(0, MAX_ITEMS_PER_FEED), feedTitle };
}

async function fetchFeed(
  url: string,
): Promise<{ items: RssItem[]; feedTitle: string } | null> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { items: cached.items, feedTitle: cached.feedTitle };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; degoog/1.0; +https://github.com/degoog)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const xml = await res.text();
    const parsed = parseRssOrAtom(xml, url);
    cache.set(url, {
      items: parsed.items,
      feedTitle: parsed.feedTitle,
      fetchedAt: Date.now(),
    });
    if (cache.size > MAX_CACHE_ENTRIES) {
      let oldest: string | null = null;
      let oldestTime = Infinity;
      for (const [key, val] of cache) {
        if (val.fetchedAt < oldestTime) {
          oldestTime = val.fetchedAt;
          oldest = key;
        }
      }
      if (oldest) cache.delete(oldest);
    }
    return parsed;
  } catch (err) {
    clearTimeout(timeout);
    debug("rss", `Failed to fetch feed: ${url}`, err);
    return null;
  }
}

const MAX_FEEDS_PER_REQUEST = 20;

async function fetchAllFeeds(urls: string[]): Promise<RssItem[]> {
  const capped = urls.slice(0, MAX_FEEDS_PER_REQUEST);
  const all: RssItem[] = [];
  for (let i = 0; i < capped.length; i += CONCURRENCY) {
    const batch = capped.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((u) => fetchFeed(u)));
    for (const r of results) {
      if (r) all.push(...r.items);
    }
  }
  all.sort((a, b) => {
    const ta = a.pubDate?.getTime() ?? 0;
    const tb = b.pubDate?.getTime() ?? 0;
    return tb - ta;
  });
  return all;
}

export async function getNewsFeedUrls(): Promise<string[]> {
  const saved = await getSavedNewsFeedUrls();
  return saved.length > 0 ? saved : [...DEFAULT_NEWS_FEED_URLS];
}

export async function getSavedNewsFeedUrls(): Promise<string[]> {
  const settings = await getSettings(NEWS_RSS_SETTINGS_ID);
  const raw = settings[URLS_KEY];
  if (!raw || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (u) => typeof u === "string" && u.startsWith("http"),
      );
    }
  } catch {
    return [];
  }
  return [];
}

export async function setNewsFeedUrls(urls: string[]): Promise<void> {
  const valid = urls.filter((u) => {
    try {
      new URL(u);
      return u.startsWith("http");
    } catch {
      return false;
    }
  });
  await setSettings(NEWS_RSS_SETTINGS_ID, {
    [URLS_KEY]: JSON.stringify(valid),
  });
  for (const url of cache.keys()) {
    if (!valid.includes(url)) cache.delete(url);
  }
}

const PAGE_SIZE = 20;

export async function searchNews(
  query: string,
  page: number,
  feedUrls?: string[],
): Promise<SearchResult[]> {
  const urls = feedUrls ?? (await getNewsFeedUrls());
  if (urls.length === 0) return [];
  const allItems = await fetchAllFeeds(urls);
  const q = query.trim().toLowerCase();
  const filtered =
    q === ""
      ? allItems
      : allItems.filter((item) => {
          const title = item.title.toLowerCase();
          const desc = item.description.toLowerCase();
          return title.includes(q) || desc.includes(q);
        });
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);
  return pageItems.map((item) => ({
    title: item.title,
    url: item.url,
    snippet: item.description,
    source: item.source,
    thumbnail: item.thumbnail,
  }));
}
