import { marked } from "marked";
import DOMPurify from "dompurify";

const MD_OPTS = { breaks: true, gfm: true } as const;
const SANITIZE_OPTS = { USE_PROFILES: { html: true } } as const;

const _externaliseLinks = (html: string): string =>
  html.replace(
    /<a (?![^>]*\btarget=)/g,
    '<a target="_blank" rel="noopener noreferrer" ',
  );

export const renderMdInline = (text: string): string => {
  if (!text) return "";
  const html = marked.parseInline(text, MD_OPTS) as string;
  return DOMPurify.sanitize(_externaliseLinks(html), SANITIZE_OPTS);
};

export const renderMdBlock = (text: string): string => {
  if (!text) return "";
  const html = marked.parse(text, MD_OPTS) as string;
  return DOMPurify.sanitize(_externaliseLinks(html), SANITIZE_OPTS);
};

declare global {
  interface Window {
    __degoogMd?: {
      inline: (s: string) => string;
      block: (s: string) => string;
    };
  }
}

if (typeof window !== "undefined") {
  window.__degoogMd = { inline: renderMdInline, block: renderMdBlock };
}
