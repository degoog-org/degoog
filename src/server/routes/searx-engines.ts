import { Hono, type Context } from "hono";
import { readObjectBody } from "../utils/hono";
import { canBalrogPass, gandalf } from "./settings-auth";
import {
  installSearx,
  listSearxItems,
  uninstallSearx,
  updateSearx,
  withSearxLock,
} from "../extensions/compatibility-layer/searx/install";
import { isSearxCompatOn } from "../extensions/compatibility-layer/searx";
import { ReloadMode, reloadSync } from "../extensions/store/reload-sync";
import { ExtensionStoreType } from "../types/extension";
import { logger } from "../utils/logger";

const NS = "searx-engines";

const router = new Hono();

const _guard = async (c: Context): Promise<Response | null> => {
  if (!(await gandalf(canBalrogPass(c))))
    return c.json({ error: "You shall not pass!" }, 401);
  if (!(await isSearxCompatOn()))
    return c.json({ error: "SearX compatibility layer is disabled" }, 404);
  return null;
};

const _refresh = async (code: string): Promise<void> => {
  try {
    await reloadSync(ExtensionStoreType.Engine, ReloadMode.Bust);
  } catch (err) {
    logger.warn(NS, `engine reload after ${code} failed, restart to pick it up`, err);
  }
};

const _codeFrom = async (c: Context): Promise<string> => {
  const body = await readObjectBody<{ code?: string }>(c);
  return body?.code?.trim() ?? "";
};

router.get("/api/searx/engines", async (c) => {
  const denied = await _guard(c);
  if (denied) return denied;
  return c.json({ engines: await listSearxItems() });
});

const _mutate =
  (run: (code: string) => Promise<void>, failure: string) => async (c: Context) => {
    const denied = await _guard(c);
    if (denied) return denied;
    const code = await _codeFrom(c);
    if (!code) return c.json({ error: "Missing code" }, 400);
    try {
      await withSearxLock(async () => {
        await run(code);
        await _refresh(code);
      });
      return c.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : failure;
      return c.json({ error: message }, 400);
    }
  };

router.post("/api/searx/install", _mutate((code) => installSearx(code), "Install failed"));
router.post("/api/searx/update", _mutate((code) => updateSearx(code), "Update failed"));
router.post("/api/searx/uninstall", _mutate((code) => uninstallSearx(code), "Uninstall failed"));

export default router;
