const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = [
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
];

export function getVideoEmbedUrl(url: string): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return null;
  }

  const videoId =
    _idFromWatchUrl(parsed) ||
    _idFromPath(parsed) ||
    _idFromShortUrl(parsed);
  if (!videoId) return null;

  const embed = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  const start = _extractStartSeconds(parsed);
  if (start > 0) embed.searchParams.set("start", String(start));
  return embed.toString();
}

function _idFromWatchUrl(parsed: URL): string | null {
  const path = parsed.pathname.replace(/\/+$/, "");
  if (path !== "/watch" && path !== "/live") return null;

  const videoId = parsed.searchParams.get("v") || "";
  return YOUTUBE_ID_RE.test(videoId) ? videoId : null;
}

function _idFromPath(parsed: URL): string | null {
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const [kind, rawId] = segments;
  if (!["embed", "shorts", "v", "live"].includes(kind)) return null;
  return YOUTUBE_ID_RE.test(rawId) ? rawId : null;
}

function _idFromShortUrl(parsed: URL): string | null {
  const pathId = parsed.pathname.split("/").filter(Boolean)[0] || "";
  return YOUTUBE_ID_RE.test(pathId) ? pathId : null;
}

function _extractStartSeconds(parsed: URL): number {
  const direct = parsed.searchParams.get("start");
  const hashTime = _timeToSeconds(parsed.hash.replace(/^#t=/, ""));
  const queryTime = _timeToSeconds(parsed.searchParams.get("t") || "");

  if (direct && Number.isFinite(Number(direct)) && Number(direct) > 0) {
    return Number(direct);
  }
  return hashTime > 0 ? hashTime : queryTime;
}

function _timeToSeconds(raw: string): number {
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);

  let total = 0;
  const matchers: Array<[RegExp, number]> = [
    [/(\d+)h/, 3600],
    [/(\d+)m/, 60],
    [/(\d+)s/, 1],
  ];

  for (const [re, factor] of matchers) {
    const match = raw.match(re);
    if (match) total += Number(match[1]) * factor;
  }

  return total;
}
