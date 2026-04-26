import type { Cheerio } from "cheerio";
import type { Element } from "domhandler";

const IMG_ATTR_CANDIDATES = [
  "data-src-hq",
  "data-src",
  "data-lazy-src",
  "data-original",
  "data-actualsrc",
  "data-img-url",
  "src",
];

const _normalize = (raw: string | undefined): string => {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return trimmed;
};

const _firstFromSrcset = (srcset: string | undefined): string => {
  if (!srcset) return "";
  const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
  return _normalize(first);
};

const _resolve = (url: string, baseUrl?: string): string => {
  if (!baseUrl) return url;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
};

const FAVICON_HINT_RE = /favicon|pubimg|biglogo|logo/i;

const _fromNode = (node: Cheerio<Element>, baseUrl?: string): string => {
  for (const attr of ["srcset", "data-srcset"]) {
    const url = _firstFromSrcset(node.attr(attr));
    if (url) return _resolve(url, baseUrl);
  }
  for (const attr of IMG_ATTR_CANDIDATES) {
    const url = _normalize(node.attr(attr));
    if (url) return _resolve(url, baseUrl);
  }
  return "";
};

export const extractImageUrl = (
  $el: Cheerio<Element>,
  baseUrl?: string,
  selectors?: string[],
): string => {
  if (selectors) {
    for (const sel of selectors) {
      const found = $el.find(sel).first();
      if (found.length === 0) continue;
      const url = _fromNode(found, baseUrl);
      if (url) return url;
    }
  }

  const sourceNode = $el.find("source[srcset], source[data-srcset]").first();
  if (sourceNode.length > 0) {
    const url = _fromNode(sourceNode, baseUrl);
    if (url) return url;
  }

  const imgs = $el.find("img");
  for (let i = 0; i < imgs.length; i++) {
    const node = imgs.eq(i);
    const cls = node.attr("class") ?? "";
    if (FAVICON_HINT_RE.test(cls)) continue;
    const w = parseInt(node.attr("width") ?? "0", 10);
    const h = parseInt(node.attr("height") ?? "0", 10);
    if (w > 0 && w < 48) continue;
    if (h > 0 && h < 48) continue;
    const url = _fromNode(node, baseUrl);
    if (url) return url;
  }

  return "";
};
