import { Hono } from "hono";
import { join } from "path";
import {
  pluginsDir as getPluginsDir,
  themesDir as getThemesDir,
} from "../utils/paths";
import {
  getPluginNamespace,
  getScriptFolderSource,
} from "../utils/plugin-assets";

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
  const filePath = join(rootDir, folder, rest);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return c.notFound();
  c.header("Content-Type", mime);
  c.header("Cache-Control", "no-cache");

  // Auto-scope JS files with the plugin's translation namespace
  // Same as injectScope but done here in the backend to avoid needing to load the entire script in the frontend first
  if (ext === ".js" || ext === ".mjs") {
    const ns = getPluginNamespace(folder);
    if (ns) {
      const code = await file.text();
      const scoped = `(function(t){${code}})(window.scopedT(${JSON.stringify(ns)}));`;
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
  const filePath = join(themesDataDir, folder, rest);
  const file = Bun.file(filePath);
  if (!(await file.exists())) return c.notFound();
  c.header("Content-Type", mime);
  c.header("Cache-Control", "no-cache");
  // Auto-scope JS files with the theme's translation namespace
  if (ext === ".js" || ext === ".mjs") {
    const ns = `themes/${folder}`;
    const code = await file.text();
    const scoped = `(function(t){${code}})(window.scopedT(${JSON.stringify(ns)}));`;
    return c.body(scoped);
  }
  return c.body(await file.arrayBuffer());
});

export default router;
