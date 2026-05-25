/**
 * @fccview here
 * I couldn't decide on one, so I added them all :shrug:
 */

import { Hono } from "hono";
import { _applyRateLimit } from "../utils/search";

let _ready = false;

export const markReady = (): void => {
  _ready = true;
};

const router = new Hono();

router.get("/healthz", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  return c.json({ ok: true });
});

router.get("/health", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  return c.json({ ok: true });
});

router.get("/readyz", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  return _ready ? c.json({ ok: true }) : c.json({ ok: false }, 503);
});

router.get("/ready", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  return _ready ? c.json({ ok: true }) : c.json({ ok: false }, 503);
});

router.get("/api/whodis", async (c) => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  return c.text("deez nuts");
});

export default router;
