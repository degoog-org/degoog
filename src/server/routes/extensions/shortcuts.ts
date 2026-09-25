import { Hono } from "hono";
import { getShortcutModuleSource } from "../../extensions/shortcuts/registry";

const router = new Hono();

router.get("/api/shortcuts/modules/:file", async (c) => {
  const file = c.req.param("file");
  const id = file.endsWith(".js") ? file.slice(0, -3) : "";
  if (!id) return c.json({ error: "Not found" }, 404);
  const source = await getShortcutModuleSource(id);
  if (!source) return c.json({ error: "Not found" }, 404);
  c.header("Content-Type", "text/javascript; charset=utf-8");
  c.header("Cache-Control", "no-store");
  return c.body(source);
});

export default router;
