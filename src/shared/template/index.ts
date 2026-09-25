import { escapeAttribute } from "../ui/tribute/escape";

const PLACEHOLDER_RE = /\{\{\s*([^#/^}][^}]*?)\s*\}\}/g;
const BLOCK_RE = /\{\{([#^])(\w+)\s+([\w.]+)\}\}([\s\S]*?)\{\{\/\2\s+\3\}\}/g;

const _resolve = (key: string, ctx: Record<string, unknown>): unknown => {
  if (key === "." || key === "@index") return ctx[key];
  let val: unknown = ctx;
  for (const part of key.split(".")) {
    if (val == null || typeof val !== "object") return undefined;
    val = (val as Record<string, unknown>)[part];
  }
  return val;
};

const _isTruthy = (val: unknown): boolean =>
  !!val && !(Array.isArray(val) && val.length === 0);

const _processBlocks = (tpl: string, ctx: Record<string, unknown>): string =>
  tpl.replace(
    BLOCK_RE,
    (_, prefix: string, type: string, key: string, inner: string) => {
      const val = _resolve(key, ctx);
      if (type === "if") {
        const show = prefix === "^" ? !_isTruthy(val) : _isTruthy(val);
        return show ? _processBlocks(inner, ctx) : "";
      }
      if (type === "each" && prefix === "#") {
        if (!Array.isArray(val)) return "";
        return val
          .map((item, i) => {
            const spreadable = !!item && typeof item === "object";
            const childCtx = spreadable
              ? {
                  ...ctx,
                  ...(item as Record<string, unknown>),
                  ".": item,
                  "@index": i,
                }
              : { ...ctx, ".": item, "@index": i };
            return _fillPlaceholders(_processBlocks(inner, childCtx), childCtx);
          })
          .join("");
      }
      return "";
    },
  );

const _fillPlaceholders = (tpl: string, ctx: Record<string, unknown>): string =>
  tpl.replace(PLACEHOLDER_RE, (_, key: string) => {
    const val = _resolve(key.trim(), ctx);
    if (val == null) return "";
    return escapeAttribute(String(val));
  });

export const renderTemplateString = (
  tpl: string,
  ctx: Record<string, unknown>,
): string => _fillPlaceholders(_processBlocks(tpl, ctx), ctx);
