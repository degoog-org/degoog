import { Hono } from "hono";
import { join } from "path";
import {
  pluginsDir as getPluginsDir,
  themesDir as getThemesDir,
  resolveContained,
} from "../utils/paths";
import {
  getPluginNamespace,
  getScriptFolderSource,
} from "../utils/plugin-assets";
import { rewritePluginPaths, rewriteThemePaths } from "../utils/extension-id";
import { TTL_MS } from "../utils/cache";

const NO_CACHE = "no-cache";
const STATIC_ASSET_CACHE = `public, max-age=${Math.floor(TTL_MS / 1000)}`;
const REWRITTEN_EXTS = new Set([".js", ".mjs", ".css"]);

const cacheFor = (ext: string): string =>
  REWRITTEN_EXTS.has(ext) ? NO_CACHE : STATIC_ASSET_CACHE;

const MIME_TYPES: Record<string, string> = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const pluginsDir = getPluginsDir();
const themesDataDir = getThemesDir();
const builtinsDir = join(
  process.cwd(),
  "src",
  "server",
  "extensions",
  "commands",
  "builtins",
);

const router = new Hono();

router.get("/plugins/:folder/*", async (c) => {
  const folder = c.req.param("folder");
  const rest = c.req.path.replace(`/plugins/${folder}/`, "");
  if (!rest || rest.includes("..") || rest.startsWith("index.")) {
    return c.notFound();
  }
  const ext = rest.substring(rest.lastIndexOf("."));
  const mime = MIME_TYPES[ext];
  if (!mime) return c.notFound();
  const source = getScriptFolderSource(folder);
  const rootDir = source === "builtin" ? builtinsDir : pluginsDir;
  const filePath = resolveContained(rootDir, folder, rest);
  if (!filePath) return c.notFound();
  const file = Bun.file(filePath);
  if (!(await file.exists())) return c.notFound();
  c.header("Content-Type", mime);
  c.header("Cache-Control", "no-cache");

  if (ext === ".js" || ext === ".mjs") {
    const ns = getPluginNamespace(folder);
    if (ns) {
      const code = rewritePluginPaths(await file.text(), folder);
      const scoped = `(function(t){const __PLUGIN_ID__=${JSON.stringify(folder)};${code}\n})(window.scopedT(${JSON.stringify(ns)}));`;
      return c.body(scoped);
    }
  }

  return c.body(await file.arrayBuffer());
});

router.get("/themes/:folder/*", async (c) => {
  const folder = c.req.param("folder");
  const rest = c.req.path.replace(`/themes/${folder}/`, "");
  if (
    !rest ||
    rest.includes("..") ||
    rest.startsWith("index.") ||
    rest === "theme.json"
  ) {
    return c.notFound();
  }
  const ext = rest.substring(rest.lastIndexOf("."));
  const mime = MIME_TYPES[ext];
  if (!mime) return c.notFound();
  const filePath = resolveContained(themesDataDir, folder, rest);
  if (!filePath) return c.notFound();
  const file = Bun.file(filePath);
  if (!(await file.exists())) return c.notFound();
  c.header("Content-Type", mime);
  c.header("Cache-Control", cacheFor(ext));

  if (ext === ".js" || ext === ".mjs") {
    const ns = `themes/${folder}`;
    const code = await file.text();
    const scoped = `(function(t){${code}\n})(window.scopedT(${JSON.stringify(ns)}));`;
    return c.body(scoped);
  }
  if (ext === ".css") {
    return c.body(rewriteThemePaths(await file.text(), folder));
  }
  return c.body(await file.arrayBuffer());
});

export default router;
