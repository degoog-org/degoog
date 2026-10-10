import { authHeaders } from "../../../utils/net/request";
import { getBase } from "../../../utils/net/base-url";
import { fetchRestartState } from "../../shared/restart-state";
import { flashError, flashSuccess } from "../../shared/flash-msg";
import { st } from "../format";
import type { StoreContext } from "../../../types/store-tab";

const POLL_MS = 1000;
const POLL_LIMIT = 60;

const _sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const _waitForRestart = async (ctx: StoreContext): Promise<boolean> => {
  for (let i = 0; i < POLL_LIMIT; i++) {
    await _sleep(POLL_MS);
    const restart = await fetchRestartState(ctx.getToken);
    if (restart && !restart.pending) return true;
  }
  return false;
};

export const restartServer = async (ctx: StoreContext): Promise<void> => {
  if (ctx.state.restarting) return;
  ctx.state.restarting = true;
  ctx.render();
  let sent = false;
  try {
    const res = await fetch(`${getBase()}/api/settings/restart`, {
      method: "POST",
      headers: authHeaders(ctx.getToken),
    });
    sent = res.ok;
  } catch (err) {
    console.debug("[store] restart trigger failed", err);
  }
  const back = sent && (await _waitForRestart(ctx));
  ctx.state.restarting = false;
  if (back) await ctx.reload();
  ctx.render();
  if (back) flashSuccess(st("restarted-flash"));
  else flashError(st("restart-failed"));
};
