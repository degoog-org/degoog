import {
  SlotPanelPosition,
  TranslateFunction,
  type PluginContext,
  type SlotPlugin,
} from "../../../../types";
import type { TtlCache } from "../../../../utils/cache";

const TIMEOUT_MS = 5_000;
const USER_AGENT = "degoog/1.0 (+https://github.com/degoog-org/degoog)";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface WikiPage {
  title: string;
  description: string;
  extract: string;
  thumbnail?: { source: string };
  fullurl?: string;
  pageid: number;
}

let _template = "";

let _wikiCache!: TtlCache<WikiPage>;

async function _fetchWikipedia(query: string): Promise<WikiPage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      action: "query",
      titles: query,
      redirects: "1",
      prop: "extracts|pageimages|info|description",
      exintro: "1",
      explaintext: "1",
      exsentences: "6",
      pithumbsize: "120",
      inprop: "url",
      format: "json",
    });
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?${params.toString()}`,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Api-User-Agent": USER_AGENT,
        },
      },
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query: { pages: Record<string, WikiPage & { missing?: "" }> };
    };
    const page = Object.values(data.query?.pages ?? {})[0];
    if (
      !page ||
      page.pageid === undefined ||
      "missing" in page ||
      !page.extract
    )
      return null;
    return page;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

const wikipediaSlot: SlotPlugin = {
  id: "wikipedia",
  get name(): string {
    return this.t!("wikipedia.name");
  },
  get description(): string {
    return this.t!("wikipedia.description");
  },
  position: SlotPanelPosition.KnowledgePanel,

  t: TranslateFunction,

  init(ctx: PluginContext): void {
    _template = ctx.template;
    _wikiCache = ctx.createCache<WikiPage>(60 * 60 * 1000);
  },

  async trigger(query: string): Promise<boolean> {
    const q = query.trim();
    if (q.length < 2 || q.length > 100) return false;
    const key = q.toLowerCase();
    const page = _wikiCache.get(key);
    if (page === null) {
      const fetched = await _fetchWikipedia(q);
      if (fetched) {
        _wikiCache.set(key, fetched);
        return true;
      }
      return false;
    }
    return true;
  },

  async execute(query: string): Promise<{ title?: string; html: string }> {
    const q = query.trim();
    const key = q.toLowerCase();
    let page = _wikiCache.get(key);
    if (page === null) {
      const fetched = await _fetchWikipedia(q);
      if (fetched) {
        _wikiCache.set(key, fetched);
        page = fetched;
      }
    }
    if (!page) return { html: "" };

    const sanitizePage: Record<string, string> = {
      title: escapeHtml(page.title),
      description: escapeHtml(page.description || ""),
      extract: escapeHtml(page.extract),
      thumbnail: page.thumbnail
        ? `<img class="wiki-thumb" src="${escapeHtml(page.thumbnail.source)}" alt="${escapeHtml(page.title)}" loading="lazy">`
        : "",
      url: page.fullurl ?? `https://en.wikipedia.org/?curid=${page.pageid}`,
    };

    const html = _template.replace(
      /\{\{(\w+)\}\}/g,
      (_, k: string) => sanitizePage[k] ?? "",
    );

    return { title: page.title, html };
  },
};

export const slot = wikipediaSlot;
