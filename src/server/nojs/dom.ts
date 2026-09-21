const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const BARE_SCRIPT_RE = /<script\b[^>]*\/?>/gi;
const INLINE_HANDLER_RE = /\son[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/g;
const MODULEPRELOAD_RE = /<link\b[^>]*\brel=["']modulepreload["'][^>]*>\s*/gi;

export interface ElementSpan {
  tag: string;
  start: number;
  openEnd: number;
  innerStart: number;
  innerEnd: number;
  end: number;
}

export const sanitizeTemplate = (html: string): string =>
  html
    .replace(SCRIPT_RE, "")
    .replace(BARE_SCRIPT_RE, "")
    .replace(MODULEPRELOAD_RE, "")
    .replace(INLINE_HANDLER_RE, "");

const _openTagEnd = (html: string, start: number): number => {
  let quote = "";
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return i;
  }
  return -1;
};

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const _spanFromOpen = (html: string, start: number): ElementSpan | null => {
  const name = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start, start + 32));
  if (!name) return null;
  const tag = name[1];
  const openEnd = _openTagEnd(html, start);
  if (openEnd < 0) return null;
  if (VOID_TAGS.has(tag.toLowerCase())) {
    return {
      tag,
      start,
      openEnd,
      innerStart: openEnd + 1,
      innerEnd: openEnd + 1,
      end: openEnd,
    };
  }
  const scan = new RegExp(`</?${tag}\\b`, "gi");
  scan.lastIndex = openEnd + 1;
  let depth = 1;
  let hit = scan.exec(html);
  while (hit) {
    if (html[hit.index + 1] === "/") {
      depth -= 1;
      if (depth === 0) {
        const end = _openTagEnd(html, hit.index);
        if (end < 0) return null;
        return {
          tag,
          start,
          openEnd,
          innerStart: openEnd + 1,
          innerEnd: hit.index,
          end,
        };
      }
    } else {
      depth += 1;
      scan.lastIndex = _openTagEnd(html, hit.index) + 1;
    }
    hit = scan.exec(html);
  }
  return null;
};

const _locate = (html: string, marker: RegExp): ElementSpan | null => {
  const hit = marker.exec(html);
  if (!hit) return null;
  const start = html.lastIndexOf("<", hit.index);
  if (start < 0) return null;
  return _spanFromOpen(html, start);
};

export const locateById = (html: string, id: string): ElementSpan | null =>
  _locate(html, new RegExp(`\\sid=["']${id}["']`));

export const locateByClass = (
  html: string,
  className: string,
): ElementSpan | null =>
  _locate(html, new RegExp(`\\sclass=["'][^"']*\\b${className}\\b[^"']*["']`));

const _splice = (
  html: string,
  from: number,
  to: number,
  value: string,
): string => html.slice(0, from) + value + html.slice(to);

export const fillById = (html: string, id: string, inner: string): string => {
  const span = locateById(html, id);
  if (!span) return html;
  return _splice(html, span.innerStart, span.innerEnd, inner);
};

export const appendToId = (html: string, id: string, extra: string): string => {
  const span = locateById(html, id);
  if (!span) return html;
  return _splice(html, span.innerEnd, span.innerEnd, extra);
};

export const replaceElementById = (
  html: string,
  id: string,
  replacement: string,
): string => {
  const span = locateById(html, id);
  if (!span) return html;
  return _splice(html, span.start, span.end + 1, replacement);
};

export const removeElementById = (html: string, id: string): string =>
  replaceElementById(html, id, "");

export const wrapElementById = (
  html: string,
  id: string,
  open: string,
  close: string,
): string => {
  const span = locateById(html, id);
  if (!span) return html;
  const element = html.slice(span.start, span.end + 1);
  return _splice(html, span.start, span.end + 1, open + element + close);
};

const _stripAttributes = (openTag: string, names: string[]): string => {
  let result = openTag;
  for (const name of names) {
    result = result.replace(
      new RegExp(`\\s${name}=(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "gi"),
      "",
    );
  }
  return result;
};

const _setAttributes = (
  html: string,
  span: ElementSpan | null,
  attrs: Record<string, string>,
): string => {
  if (!span) return html;
  const names = Object.keys(attrs);
  if (names.length === 0) return html;
  const openTag = html.slice(span.start, span.openEnd);
  const stripped = _stripAttributes(openTag, names).replace(/\s*\/$/, "");
  const added = names
    .map((name) => ` ${name}="${attrs[name]}"`)
    .join("");
  return _splice(html, span.start, span.openEnd, stripped + added);
};

export const setAttributesById = (
  html: string,
  id: string,
  attrs: Record<string, string>,
): string => _setAttributes(html, locateById(html, id), attrs);

export const setAttributesByClass = (
  html: string,
  className: string,
  attrs: Record<string, string>,
): string => _setAttributes(html, locateByClass(html, className), attrs);

export const addClassById = (
  html: string,
  id: string,
  className: string,
): string => {
  const span = locateById(html, id);
  if (!span) return html;
  const openTag = html.slice(span.start, span.openEnd);
  if (!/\sclass=/i.test(openTag)) {
    return _splice(
      html,
      span.start,
      span.openEnd,
      `${openTag.replace(/\s*\/$/, "")} class="${className}"`,
    );
  }
  const widened = openTag.replace(
    /(\sclass=)("([^"]*)"|'([^']*)')/i,
    (_full, lead: string, _quoted: string, dq?: string, sq?: string) => {
      const current = dq ?? sq ?? "";
      return `${lead}"${current ? `${current} ${className}` : className}"`;
    },
  );
  return _splice(html, span.start, span.openEnd, widened);
};

export const addClassWhereClass = (
  html: string,
  present: string,
  added: string,
): string =>
  html.replace(/\sclass="([^"]*)"/g, (full, value: string) => {
    const names = value.split(/\s+/).filter(Boolean);
    if (!names.includes(present) || names.includes(added)) return full;
    return ` class="${value} ${added}"`;
  });

export const insertBeforeHeadEnd = (html: string, extra: string): string => {
  if (!extra) return html;
  const at = html.toLowerCase().indexOf("</head>");
  if (at < 0) return html;
  return _splice(html, at, at, extra);
};
