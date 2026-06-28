import { Hono } from "hono";
import {
  getThemes,
  getActiveTheme,
  getActiveThemeId,
  getActiveThemeDataAttrsMap,
  setActiveTheme,
} from "../extensions/themes/registry";
import { canBalrogPass, gandalf } from "./settings-auth";
import { logger } from "../utils/logger";

const router = new Hono();

router.get("/api/themes", (c) => {
  const themes = getThemes();
  const activeId = getActiveThemeId();
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

router.post("/api/theme/active", async (c) => {
  const token = canBalrogPass(c);
  if (!(await gandalf(token)))
    return c.json({ error: "You shall not pass!" }, 401);
  let body: { id: string | null };
  try {
    body = await c.req.json<{ id: string | null }>();
  } catch (err) {
    logger.debug("themes", "invalid JSON body on theme active", err);
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const ok = await setActiveTheme(body.id ?? null);
  if (!ok) return c.json({ error: "Theme not found" }, 400);
  return c.json({
    ok: true,
    activeId: body.id,
    hasCss: !!getActiveTheme()?.compiledCss,
    dataAttrs: await getActiveThemeDataAttrsMap(),
  });
});

router.get("/theme/style.css", (c) => {
  const theme = getActiveTheme();
  if (!theme?.compiledCss) return c.notFound();
  return c.body(theme.compiledCss, 200, {
    "Content-Type": "text/css; charset=utf-8",
  });
});

export default router;
