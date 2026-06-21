import {
  SlotPanelPosition,
  TranslateFunction,
  type PluginContext,
  type SettingField,
  type SlotPlugin,
  type SlotPluginContext,
} from "../../../../types";
import type { AsyncTtlCache } from "../../../../utils/cache";
import { getSettings } from "../../../../utils/plugin-settings";
import { logger } from "../../../../utils/logger";
const WIKI_NAMESPACE = "ext:wikipedia:page";
const WIKI_TTL_MS = 60 * 60 * 1000;

const WIKI_SETTINGS_ID = "wikipedia-slot";
const DEFAULT_WIKI_DOMAIN = "en.wikipedia.org";
const WIKI_DOMAIN_PATTERN = /^[a-z0-9-]+\.wikipedia\.org$/;

export const toWikiDomain = (raw: unknown): string => {
  const cleaned = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  return WIKI_DOMAIN_PATTERN.test(cleaned) ? cleaned : DEFAULT_WIKI_DOMAIN;
};

const _wikiDomain = async (): Promise<string> => {
  const stored = await getSettings(WIKI_SETTINGS_ID);
  return toWikiDomain(stored["domain"]);
};

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
  thumbnail?: { source: string; isLogo?: boolean };
  fullurl?: string;
  pageid: number;
  wikibase_item?: string;
}

let _template = "";
let _signProxyUrl: PluginContext["signProxyUrl"] | null = null;

let _wikiCache!: AsyncTtlCache<WikiPage>;

const _proxyImageUrl = (url: string): string => {
  if (!url || !_signProxyUrl) return "";
  return _signProxyUrl(url);
};

async function _fetchWikidataThumb(
  entityId: string,
  signal: AbortSignal,
): Promise<WikiPage["thumbnail"]> {
  try {
    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: entityId,
      props: "claims",
      format: "json",
    });
    const res = await fetch(
      `https://www.wikidata.org/w/api.php?${params.toString()}`,
      { signal, headers: { "User-Agent": USER_AGENT } },
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      entities: Record<string, {
        claims: Record<string, Array<{ mainsnak: { datavalue?: { value: string } } }>>;
      }>;
    };
    const claims = data.entities[entityId]?.claims ?? {};
    const filename =
      claims["P154"]?.[0]?.mainsnak?.datavalue?.value ??
      claims["P18"]?.[0]?.mainsnak?.datavalue?.value;
    if (!filename) return undefined;
    const encoded = encodeURIComponent(filename.replace(/ /g, "_"));
    const resolved = await fetch(
      `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}`,
      { method: "HEAD", redirect: "follow", signal, headers: { "User-Agent": USER_AGENT } },
    ).then((r) => r.url).catch(() => null);
    if (!resolved) return undefined;
    return { source: resolved, isLogo: true };
  } catch {
    return undefined;
  }
}

async function _fetchWikipedia(
  query: string,
  host: string,
): Promise<WikiPage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      action: "query",
      titles: query,
      redirects: "1",
      prop: "extracts|pageimages|pageprops|info|description",
      exintro: "1",
      explaintext: "1",
      exsentences: "6",
      pithumbsize: "300",
      pilicense: "any",
      inprop: "url",
      format: "json",
    });
    const res = await fetch(
      `https://${host}/w/api.php?${params.toString()}`,
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
      query: {
        pages: Record<
          string,
          WikiPage & { missing?: ""; pageprops?: { wikibase_item?: string } }
        >;
      };
    };
    const raw = Object.values(data.query?.pages ?? {})[0];
    if (!raw || raw.pageid === undefined || "missing" in raw || !raw.extract)
      return null;

    const page: WikiPage = {
      title: raw.title,
      description: raw.description,
      extract: raw.extract,
      thumbnail: raw.thumbnail,
      fullurl: raw.fullurl,
      pageid: raw.pageid,
      wikibase_item: raw.pageprops?.wikibase_item,
    };

    if (!page.thumbnail && page.wikibase_item) {
      const wdController = new AbortController();
      const wdTimer = setTimeout(() => wdController.abort(), TIMEOUT_MS);
      page.thumbnail = await _fetchWikidataThumb(page.wikibase_item, wdController.signal);
      clearTimeout(wdTimer);
    }

    return page;
  } catch (err) {
    logger.debug("wikipedia", `fetch failed for "${query}"`, err);
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
  isClientExposed: false,

  t: TranslateFunction,

  init(ctx: PluginContext): void {
    _template = ctx.template;
    if (ctx.signProxyUrl) _signProxyUrl = ctx.signProxyUrl;
    _wikiCache = ctx.useCache<WikiPage>(WIKI_NAMESPACE, WIKI_TTL_MS);
  },

  settingsSchema: [
    {
      key: "domain",
      label: "Wikipedia domain",
      type: "text",
      default: DEFAULT_WIKI_DOMAIN,
      placeholder: DEFAULT_WIKI_DOMAIN,
      description:
        "Wikipedia domain the knowledge panel reads from, e.g. en.wikipedia.org or fr.wikipedia.org. Enter the full domain, not just a language code. Must be a *.wikipedia.org host; anything else falls back to en.wikipedia.org.",
    },
  ] as SettingField[],

  async trigger(query: string): Promise<boolean> {
    const q = query.trim();
    if (q.length < 2 || q.length > 100) return false;
    const host = await _wikiDomain();
    const key = `${host}:${q.toLowerCase()}`;
    const page = await _wikiCache.get(key);
    if (page === null) {
      const fetched = await _fetchWikipedia(q, host);
      if (fetched) {
        await _wikiCache.set(key, fetched);
        return true;
      }
      return false;
    }
    return true;
  },

  async execute(query: string, ctx?: SlotPluginContext): Promise<{ title?: string; html: string }> {
    const sign = ctx?.signProxyUrl ?? _signProxyUrl;
    const proxy = (url: string) => (sign ? sign(url) : "");
    const q = query.trim();
    const host = await _wikiDomain();
    const key = `${host}:${q.toLowerCase()}`;
    let page = await _wikiCache.get(key);
    if (page === null) {
      const fetched = await _fetchWikipedia(q, host);
      if (fetched) {
        await _wikiCache.set(key, fetched);
        page = fetched;
      }
    }
    if (!page) return { html: "" };

    const sanitizePage: Record<string, string> = {
      title: escapeHtml(page.title),
      description: escapeHtml(page.description || ""),
      extract: escapeHtml(page.extract),
      thumbnail: page.thumbnail
        ? `<img class="${page.thumbnail.isLogo ? "wiki-thumb--logo" : "wiki-thumb"}" src="${escapeHtml(proxy(page.thumbnail.source))}" alt="${escapeHtml(page.title)}" loading="lazy">`
        : "",
      url: page.fullurl ?? `https://${host}/?curid=${page.pageid}`,
    };

    const html = _template.replace(
      /\{\{(\w+)\}\}/g,
      (_, k: string) => sanitizePage[k] ?? "",
    );

    return { title: page.title, html };
  },
};

export const slot = wikipediaSlot;
