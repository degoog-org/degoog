import type { SearxCatalogEntry, SearxSharedFile } from "./catalog-types";
import { PythonLib } from "./python-deps";
import { customEntries, customEntry } from "./custom";

export const SEARX_SOURCE_BASE_URL =
  "https://raw.githubusercontent.com/searxng/searxng/master/searx/engines";

export const SEARX_TRAITS_URL =
  "https://raw.githubusercontent.com/searxng/searxng/master/searx/data/engine_traits.json";

const { Babel, DateUtil, Lxml } = PythonLib;

/**
 * @fccview here - Hey! You thought it was magic? Well kinda.
 * However there's a big ass list of engines painfully manually tested and curated by yours truly.
 * 
 * The biggest effort was made by the incredible SearxNG team however, I do not manintain these, nor I ever will, I just found a clever
 * way to route them within degoog to give my users the best experience possible.
 * 
 * Big up to open source my friends <3 
 */

export const SEARX_CATALOG: readonly SearxCatalogEntry[] = [
  { code: "360search_videos", name: "360Search Videos", types: ["videos"], site: "https://tv.360kan.com" },
  { code: "500px", name: "500px", types: ["images"], site: "https://500px.com" },
  { code: "acfun", name: "Acfun", types: ["videos"], site: "https://www.acfun.cn", libs: [Lxml] },
  { code: "alpinelinux", name: "Alpine Linux", types: ["packages", "it"], site: "https://www.alpinelinux.org", libs: [DateUtil, Lxml] },
  { code: "ansa", name: "Ansa", types: ["news"], site: "https://www.ansa.it", libs: [Lxml] },
  { code: "apkmirror", name: "APKMirror", types: ["it"], site: "https://www.apkmirror.com", libs: [Lxml] },
  { code: "apple_app_store", name: "Apple App Store", types: ["it"], site: "https://www.apple.com/app-store", libs: [DateUtil] },
  { code: "apple_maps", name: "Apple Maps", types: ["map"], site: "https://www.apple.com", deps: ["openstreetmap", "wikidata", "wikipedia"] },
  { code: "artic", name: "Artic", types: ["images"], site: "https://www.artic.edu" },
  { code: "artstation", name: "Artstation", types: ["images"], site: "https://www.artstation.com" },
  { code: "arxiv", name: "arXiv", types: ["science", "scientific publications"], site: "https://arxiv.org", libs: [Lxml] },
  { code: "baidu", name: "Baidu", types: ["other"], site: "https://www.baidu.com" },
  { code: "bilibili", name: "Bilibili", types: ["videos"], site: "https://www.bilibili.com", libs: [Lxml] },
  { code: "bing_images", name: "Bing Images", types: ["images"], site: "https://www.bing.com", deps: ["bing"], libs: [Lxml] },
  { code: "bing_news", name: "Bing News", types: ["news"], site: "https://www.bing.com", deps: ["bing"], libs: [Lxml] },
  { code: "bing_videos", name: "Bing Videos", types: ["videos"], site: "https://www.bing.com", deps: ["bing", "bing_images"], libs: [Lxml] },
  { code: "bitchute", name: "Bitchute", types: ["videos"], site: "https://bitchute.com" },
  { code: "boardreader", name: "Boardreader", types: ["web", "social media"], site: "https://boardreader.com", deps: ["json_engine"], libs: [Babel] },
  { code: "bpb", name: "bpb", types: ["web"], site: "https://www.bpb.de" },
  { code: "brave", name: "Brave", types: ["other"], site: "https://search.brave.com", libs: [Babel, DateUtil, Lxml] },
  { code: "bt4g", name: "Bt4G", types: ["files"], site: "https://bt4gprx.com", libs: [Lxml] },
  { code: "btdigg", name: "Btdigg", types: ["files"], site: "https://btdig.com", libs: [Lxml] },
  { code: "cachy_os", name: "CachyOS", types: ["packages", "it"], site: "https://cachyos.org" },
  { code: "ccc_media", name: "Ccc Media", types: ["videos"], site: "https://media.ccc.de", libs: [DateUtil] },
  { code: "chatnoir", name: "ChatNoir", types: ["web"], site: "https://www.chatnoir.eu", libs: [Lxml] },
  { code: "chefkoch", name: "Chefkoch", types: ["other"], site: "https://www.chefkoch.de" },
  { code: "chinaso", name: "ChinaSo", types: ["other"], site: "https://www.chinaso.com", libs: [Lxml] },
  { code: "core", name: "Core", types: ["science", "scientific publications"], site: "https://core.ac.uk" },
  { code: "crates", name: "crates.io", types: ["it", "packages"], site: "https://crates.io", libs: [DateUtil] },
  { code: "crossref", name: "Crossref", types: ["science", "scientific publications"], site: "https://www.crossref.org" },
  { code: "dailymotion", name: "Dailymotion", types: ["videos"], site: "https://www.dailymotion.com", libs: [Babel, Lxml] },
  { code: "deezer", name: "Deezer", types: ["music"], site: "https://deezer.com" },
  { code: "demo_online", name: "Demo Online", types: ["images"] },
  { code: "deviantart", name: "DeviantArt", types: ["images"], site: "https://www.deviantart.com", libs: [Lxml] },
  { code: "devicons", name: "Devicons", types: ["images"], site: "https://devicon.dev" },
  { code: "docker_hub", name: "Docker Hub", types: ["it", "packages"], site: "https://hub.docker.com", libs: [DateUtil] },
{ code: "dogpile", name: "Dogpile", types: ["web"], site: "https://www.dogpile.com", libs: [Lxml] },
  { code: "duckduckgo_definitions", name: "Duckduckgo Definitions", types: ["other"], site: "https://duckduckgo.com", libs: [Lxml] },
  { code: "duckduckgo_web", name: "Duckduckgo Web", types: ["web"], site: "https://duckduckgo.com", libs: [Lxml] },
  { code: "duden", name: "Duden", types: ["dictionaries"], site: "https://www.duden.de", libs: [Lxml] },
  { code: "europepmc", name: "Europe PMC", types: ["science", "scientific publications"], site: "https://europepmc.org", libs: [DateUtil, Lxml] },
  { code: "fdroid", name: "F-Droid", types: ["it"], site: "https://f-droid.org", libs: [Lxml] },
  { code: "findfiles", name: "Findfiles", types: ["files"], site: "https://findfiles.net", libs: [Lxml] },
  { code: "findthatmeme", name: "Findthatmeme", types: ["images"], site: "https://findthatmeme.com" },
  { code: "flickr_noapi", name: "Flickr Noapi", types: ["images"], site: "https://www.flickr.com" },
  { code: "frinkiac", name: "Frinkiac", types: ["images"], site: "https://frinkiac.com" },
  { code: "fyyd", name: "fyyd", types: ["other"], site: "https://fyyd.de" },
  { code: "genius", name: "Genius", types: ["music", "lyrics"], site: "https://genius.com" },
  { code: "giphy", name: "Giphy", types: ["images"], site: "https://giphy.com", libs: [Lxml] },
  { code: "github", name: "Github", types: ["it", "repos"], site: "https://github.com", libs: [DateUtil] },
  { code: "gmx", name: "Gmx", types: ["web"], site: "https://search.gmx.com", libs: [Lxml] },
  { code: "goodreads", name: "Goodreads", types: ["other"], site: "https://www.goodreads.com", libs: [Lxml] },
  { code: "google_cse", name: "Google Cse", types: ["web"], site: "https://www.google.com", deps: ["google"] },
  { code: "google_images", name: "Google Images", types: ["images"], site: "https://images.google.com", deps: ["google"] },
  { code: "google_play", name: "Google Play", types: ["other"], site: "https://play.google.com", libs: [Lxml] },
  { code: "grokipedia", name: "Grokipedia", types: ["web"], site: "https://grokipedia.com" },
  { code: "hackernews", name: "Hackernews", types: ["it"], site: "https://news.ycombinator.com", libs: [DateUtil] },
  { code: "hex", name: "Hex", types: ["it", "packages"], site: "https://hex.pm", libs: [DateUtil] },
  { code: "huggingface", name: "Huggingface", types: ["it", "repos"], site: "https://huggingface.co" },
  { code: "iconify", name: "Iconify", types: ["images"], site: "https://iconify.design" },
  { code: "il_post", name: "Il Post", types: ["news"], site: "https://www.ilpost.it" },
  { code: "imdb", name: "Imdb", types: ["movies"], site: "https://imdb.com" },
  { code: "ipernity", name: "Ipernity", types: ["images"], site: "https://www.ipernity.com", libs: [Lxml] },
  { code: "iqiyi", name: "Iqiyi", types: ["videos"], site: "https://www.iqiyi.com" },
  { code: "jisho", name: "Jisho", types: ["dictionaries"], site: "https://jisho.org" },
  { code: "mastodon", name: "Mastodon", types: ["social media"], site: "https://joinmastodon.org" },
  { code: "mediathekviewweb", name: "Mediathekviewweb", types: ["videos"], site: "https://mediathekviewweb.de" },
  { code: "mediawiki", name: "Mediawiki", types: ["web"] },
  { code: "microsoft_learn", name: "Microsoft Learn", types: ["it"], site: "https://learn.microsoft.com" },
  { code: "mixcloud", name: "Mixcloud", types: ["music"], site: "https://www.mixcloud.com", libs: [DateUtil] },
  { code: "mojeek", name: "Mojeek", types: ["web"], site: "https://mojeek.com", libs: [Babel, DateUtil, Lxml] },
  { code: "mwmbl", name: "Mwmbl", types: ["web"], site: "https://github.com" },
  { code: "naver", name: "Naver", types: ["other"], site: "https://search.naver.com", libs: [Lxml] },
  { code: "neocities", name: "Neocities", types: ["web", "blogs"], site: "https://neocities.org", libs: [Lxml] },
  { code: "neosearch", name: "NeoSearch", types: ["web"], site: "https://neosearch.org", libs: [Babel, Lxml] },
  { code: "npm", name: "npm", types: ["it", "packages"], site: "https://npms.io", libs: [DateUtil] },
  { code: "nvd", name: "NVD", types: ["it"], site: "https://nvd.nist.gov" },
  { code: "nyaa", name: "Nyaa", types: ["files"], site: "https://nyaa.si", libs: [Lxml] },
  { code: "odysee", name: "Odysee", types: ["videos"], site: "https://odysee.com", libs: [Babel] },
  { code: "openalex", name: "Openalex", types: ["science", "scientific publications"], site: "https://openalex.org" },
  { code: "openclipart", name: "Openclipart", types: ["images"], site: "https://openclipart.org", libs: [Lxml] },
  { code: "openlibrary", name: "Openlibrary", types: ["web", "books"], site: "https://openlibrary.org", libs: [DateUtil] },
  { code: "openverse", name: "Openverse", types: ["images"], site: "https://openverse.org" },
  { code: "pexels", name: "Pexels", types: ["images"], site: "https://www.pexels.com", libs: [Lxml] },
  { code: "photon", name: "Photon", types: ["map"], site: "https://photon.komoot.io" },
  { code: "picjumbo", name: "Picjumbo", types: ["images"], site: "https://picjumbo.com", libs: [Lxml] },
  { code: "pinterest", name: "Pinterest", types: ["images"], site: "https://www.pinterest.com" },
  { code: "piratebay", name: "Piratebay", types: ["files"], site: "https://thepiratebay.org" },
  { code: "pkg_go_dev", name: "pkg.go.dev", types: ["packages", "it"], site: "https://pkg.go.dev", libs: [Babel, DateUtil, Lxml] },
  { code: "podchaser", name: "Podchaser", types: ["other"], site: "https://www.podchaser.com" },
  { code: "privacywall", name: "Privacywall", types: ["other"], site: "https://privacywall.org", libs: [Babel, Lxml] },
  { code: "pubmed", name: "Pubmed", types: ["science", "scientific publications"], site: "https://www.ncbi.nlm.nih.gov", libs: [Lxml] },
  { code: "quark", name: "Quark", types: ["other"], site: "https://quark.sm.cn" },
  { code: "repology", name: "Repology", types: ["packages", "it"], site: "https://repology.org" },
  { code: "resulthunter", name: "Resulthunter", types: ["other"], site: "https://resulthunter.com", deps: ["brave"], libs: [Lxml] },
  { code: "rottentomatoes", name: "Rottentomatoes", types: ["movies"], site: "https://www.rottentomatoes.com", libs: [Lxml] },
  { code: "selfhst", name: "selfh.st", types: ["images"], site: "https://selfh.st/icons", libs: [DateUtil] },
  { code: "semantic_scholar", name: "Semantic Scholar", types: ["science", "scientific publications"], site: "https://www.semanticscholar.org", libs: [Lxml] },
  { code: "senscritique", name: "Senscritique", types: ["movies"], site: "https://www.senscritique.com" },
  { code: "seznam", name: "Seznam", types: ["web"], site: "https://www.seznam.cz", libs: [Lxml] },
  { code: "sogou", name: "Sogou", types: ["web"], site: "https://www.sogou.com", libs: [Lxml] },
  { code: "sogou_images", name: "Sogou Images", types: ["images"], site: "https://pic.sogou.com" },
  { code: "sogou_videos", name: "Sogou Videos", types: ["videos"], site: "https://v.sogou.com" },
  { code: "sogou_wechat", name: "Sogou Wechat", types: ["news"], site: "https://weixin.sogou.com", libs: [Lxml] },
  { code: "soundcloud", name: "Soundcloud", types: ["music"], site: "https://soundcloud.com", libs: [DateUtil, Lxml] },
  { code: "stackexchange", name: "Stackexchange", types: ["other"], site: "https://stackexchange.com" },
  { code: "startpagina", name: "Startpagina", types: ["web"], site: "https://startpagina.nl", libs: [DateUtil] },
  { code: "steam", name: "Steam", types: ["other"], site: "https://store.steampowered.com", libs: [Lxml] },
  { code: "tagesschau", name: "Tagesschau", types: ["web", "news"], site: "https://tagesschau.de" },
  { code: "tootfinder", name: "Tootfinder", types: ["social media"], site: "https://www.tootfinder.ch", libs: [Lxml] },
  { code: "translated", name: "Translated", types: ["web", "translate"], site: "https://mymemory.translated.net" },
  { code: "uxwing", name: "UXWing", types: ["images"], site: "https://uxwing.com", libs: [Lxml] },
  { code: "voidlinux", name: "Void Linux", types: ["packages", "it"], site: "https://voidlinux.org/packages" },
  { code: "wallhaven", name: "Wallhaven", types: ["images"], site: "https://wallhaven.cc" },
  { code: "wolframalpha_noapi", name: "Wolframalpha Noapi", types: ["other"], site: "https://www.wolframalpha.com" },
  { code: "yahoo_news", name: "Yahoo News", types: ["news"], site: "https://news.yahoo.com", deps: ["yahoo"], libs: [DateUtil, Lxml] },
  { code: "youtube_noapi", name: "Youtube Noapi", types: ["videos", "music"], site: "https://www.youtube.com" },
];

export const SEARX_SHARED_FILES: readonly SearxSharedFile[] = [
  { code: "bing", libs: [Babel, Lxml] },
  { code: "google", libs: [Babel, Lxml] },
  { code: "json_engine" },
  { code: "openstreetmap" },
  { code: "wikidata", libs: [Babel, DateUtil] },
  { code: "wikipedia", libs: [Babel, Lxml] },
  { code: "yahoo", libs: [Lxml] },
];

const _byCode = new Map(SEARX_CATALOG.map((entry) => [entry.code, entry]));

const _shared = new Map(SEARX_SHARED_FILES.map((file) => [file.code, file]));

export const SEARX_EXTRA_ENGINES_ENV = "DEGOOG_SEARX_EXTRA_ENGINES";

const _extraEngines = (): string[] =>
  (process.env[SEARX_EXTRA_ENGINES_ENV] ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

export const isCuratedEngine = (code: string): boolean => _byCode.has(code);

export const catalogEntry = (code: string): SearxCatalogEntry | undefined =>
  _byCode.get(code) ?? customEntry(code);

export const catalogDeps = (code: string): string[] =>
  catalogEntry(code)?.deps ?? [];

export const isSupportFile = (code: string): boolean => _shared.has(code);

export const isSupportedEngine = (code: string): boolean =>
  _byCode.has(code) || _extraEngines().includes(code) || customEntry(code) !== undefined;

export const isHelperFile = (code: string): boolean =>
  isSupportFile(code) ||
  (!isSupportedEngine(code) && customEntries().some((entry) => entry.deps?.includes(code)));

export const dependants = (code: string): string[] =>
  [...SEARX_CATALOG, ...customEntries()]
    .filter((entry) => entry.deps?.includes(code))
    .map((entry) => entry.code);

const _fileLibs = (code: string): readonly PythonLib[] =>
  catalogEntry(code)?.libs ?? _shared.get(code)?.libs ?? [];

export const engineLibs = (code: string): PythonLib[] => {
  const needed = new Set<PythonLib>(_fileLibs(code));
  for (const dep of catalogDeps(code)) {
    for (const lib of _fileLibs(dep)) needed.add(lib);
  }
  return Object.values(PythonLib).filter((lib) => needed.has(lib));
};
