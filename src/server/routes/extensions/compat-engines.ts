import { Hono, type Context } from "hono";
import { readObjectBody } from "../../utils/hono";
import { canBalrogPass, gandalf } from "../settings/settings-auth";
import {
  compatLayer,
  isLayerOn,
  type CompatLayerDef,
} from "../../extensions/compatibility-layer/registry";
import { CompatAction } from "../../../shared/compat-layers";
import { ReloadMode, reloadSync } from "../../extensions/store/reload-sync";
import { ExtensionStoreType } from "../../types/extension";
import { scrubLog } from "../../extensions/compatibility-layer/scrub-log";
import { logger } from "../../utils/logger";

const NS = "compat-engines";

const router = new Hono();

interface Resolved {
  layer: CompatLayerDef;
}

const _guard = async (c: Context): Promise<Response | Resolved> => {
  if (!(await gandalf(canBalrogPass(c))))
    return c.json({ error: "You shall not pass!" }, 401);
  const layer = compatLayer(c.req.param("layer") ?? "");
  if (!layer) return c.json({ error: "Unknown compatibility layer" }, 404);
  if (!(await isLayerOn(layer)))
    return c.json({ error: `${layer.label} compatibility layer is disabled` }, 404);
  return { layer };
};

const _isDenied = (result: Response | Resolved): result is Response =>
  result instanceof Response;

const _refresh = async (code: string): Promise<void> => {
  try {
    await reloadSync(ExtensionStoreType.Engine, ReloadMode.Bust);
  } catch (err) {
    logger.warn(NS, `engine reload after ${code} failed, restart to pick it up`, err);
  }
};

const _codeFrom = async (c: Context): Promise<string> => {
  const body = await readObjectBody<{ code?: unknown }>(c);
  return typeof body?.code === "string" ? body.code.trim() : "";
};

const ACTIONS: Record<CompatAction, keyof CompatLayerDef> = {
  [CompatAction.Install]: "install",
  [CompatAction.Update]: "update",
  [CompatAction.Uninstall]: "uninstall",
};

const FAILURES: Record<CompatAction, string> = {
  [CompatAction.Install]: "Install failed",
  [CompatAction.Update]: "Update failed",
  [CompatAction.Uninstall]: "Uninstall failed",
};

router.get("/api/compat/:layer/engines", async (c) => {
  const result = await _guard(c);
  if (_isDenied(result)) return result;
  return c.json({ engines: await result.layer.listItems() });
});

const _mutate = (action: CompatAction) => async (c: Context) => {
  const result = await _guard(c);
  if (_isDenied(result)) return result;
  const { layer } = result;
  const code = await _codeFrom(c);
  if (!code) return c.json({ error: "Missing code" }, 400);
  const run = layer[ACTIONS[action]] as (code: string) => Promise<void>;
  try {
    await layer.lock(async () => {
      await run(code);
      await _refresh(code);
    });
    return c.json({ ok: true });
  } catch (e) {
    logger.warn(NS, `${layer.label} ${action} of ${scrubLog(code)} failed`, e);
    const message = e instanceof Error ? e.message : FAILURES[action];
    return c.json({ error: message }, 400);
  }
};

for (const action of Object.values(CompatAction)) {
  router.post(`/api/compat/:layer/${action}`, _mutate(action));
}

export default router;
