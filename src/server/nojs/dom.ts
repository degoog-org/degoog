import { logger } from "../utils/logger";

const _idSelector = (id: string): string => `[id="${id.replace(/"/g, '\\"')}"]`;

const _classSelector = (className: string): string =>
  `[class~="${className.replace(/"/g, '\\"')}"]`;

const _missing = (op: string, selector: string, loud: boolean): void => {
  const message = `${op} found no element matching ${selector} in the theme template`;
  if (loud) logger.warn("nojs", message);
  else logger.debug("nojs", message);
};

const _transform = async (
  html: string,
  selector: string,
  handler: (element: HTMLRewriterTypes.Element) => void,
  op: string,
  loud = false,
  firstOnly = true,
): Promise<string> => {
  let seen = 0;
  const out = await new HTMLRewriter()
    .on(selector, {
      element(element) {
        seen += 1;
        if (firstOnly && seen > 1) return;
        handler(element);
      },
    })
    .transform(new Response(html))
    .text();
  if (seen === 0) {
    _missing(op, selector, loud);
    return html;
  }
  return out;
};

export const sanitizeTemplate = async (html: string): Promise<string> =>
  await new HTMLRewriter()
    .on("script", {
      element(element) {
        element.remove();
      },
    })
    .on("link[rel=modulepreload]", {
      element(element) {
        element.remove();
      },
    })
    .on("*", {
      element(element) {
        const handlers = [...element.attributes]
          .map(([name]) => name)
          .filter((name) => /^on[a-z]+$/i.test(name));
        if (handlers.length === 0) return;
        for (const name of handlers) element.removeAttribute(name);
      },
    })
    .transform(new Response(html))
    .text();

export const fillById = async (
  html: string,
  id: string,
  inner: string,
): Promise<string> =>
  _transform(
    html,
    _idSelector(id),
    (element) => element.setInnerContent(inner, { html: true }),
    "fillById",
    true,
  );

export const appendToId = async (
  html: string,
  id: string,
  extra: string,
): Promise<string> =>
  _transform(
    html,
    _idSelector(id),
    (element) => element.append(extra, { html: true }),
    "appendToId",
    true,
  );

export const replaceElementById = async (
  html: string,
  id: string,
  replacement: string,
): Promise<string> =>
  _transform(
    html,
    _idSelector(id),
    (element) => element.replace(replacement, { html: true }),
    "replaceElementById",
    true,
  );

export const removeElementById = async (
  html: string,
  id: string,
): Promise<string> =>
  _transform(
    html,
    _idSelector(id),
    (element) => element.remove(),
    "removeElementById",
  );

export const wrapElementById = async (
  html: string,
  id: string,
  open: string,
  close: string,
): Promise<string> =>
  _transform(
    html,
    _idSelector(id),
    (element) => {
      element.before(open, { html: true });
      element.after(close, { html: true });
    },
    "wrapElementById",
  );

const _setAttributes = (
  element: HTMLRewriterTypes.Element,
  attrs: Record<string, string>,
): void => {
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, value);
  }
};

export const setAttributesById = async (
  html: string,
  id: string,
  attrs: Record<string, string>,
): Promise<string> =>
  Object.keys(attrs).length === 0
    ? html
    : _transform(
        html,
        _idSelector(id),
        (element) => _setAttributes(element, attrs),
        "setAttributesById",
      );

export const setAttributesByClass = async (
  html: string,
  className: string,
  attrs: Record<string, string>,
): Promise<string> =>
  Object.keys(attrs).length === 0
    ? html
    : _transform(
        html,
        _classSelector(className),
        (element) => _setAttributes(element, attrs),
        "setAttributesByClass",
      );

const _withClass = (
  element: HTMLRewriterTypes.Element,
  className: string,
): void => {
  const current = element.getAttribute("class") ?? "";
  if (current.split(/\s+/).includes(className)) return;
  element.setAttribute("class", current ? `${current} ${className}` : className);
};

export const addClassById = async (
  html: string,
  id: string,
  className: string,
): Promise<string> =>
  _transform(
    html,
    _idSelector(id),
    (element) => _withClass(element, className),
    "addClassById",
  );

export const addClassWhereClass = async (
  html: string,
  present: string,
  added: string,
): Promise<string> =>
  _transform(
    html,
    _classSelector(present),
    (element) => _withClass(element, added),
    "addClassWhereClass",
    false,
    false,
  );

export const insertBeforeHeadEnd = async (
  html: string,
  extra: string,
): Promise<string> =>
  extra
    ? _transform(
        html,
        "head",
        (element) => element.append(extra, { html: true }),
        "insertBeforeHeadEnd",
      )
    : html;
