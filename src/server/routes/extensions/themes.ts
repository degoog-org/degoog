import { Hono } from "hono";
import { readObjectBody } from "../../utils/hono";
import {
  getThemes,
  getActiveTheme,
  getActiveThemeId,
  setActiveTheme,
} from "../../extensions/themes/registry";
import { settingsAuth } from "../_guards";

const router = new Hono();

router.get("/api/themes", async (c) => {
  const themes = getThemes();
  const activeId = await getActiveThemeId();
  return c.json({
    themes: themes.map((t) => ({
      id: t.id,
      name: t.manifest.name,
      description: t.manifest.description ?? "",
      configurable: !!t.manifest.settingsSchema?.length,
    })),
    activeId,
  });
});

router.post("/api/theme/active", settingsAuth(), async (c) => {
  const body = await readObjectBody<{ id: string | null }>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  const ok = await setActiveTheme(body.id ?? null);
  if (!ok) return c.json({ error: "Theme not found" }, 400);
  return c.json({ ok: true, activeId: body.id });
});

router.get("/theme/style.css", async (c) => {
  const theme = await getActiveTheme();
  if (!theme?.compiledCss) return c.notFound();
  return c.body(theme.compiledCss, 200, {
    "Content-Type": "text/css; charset=utf-8",
    "Cache-Control": "no-cache",
  });
});

export default router;
