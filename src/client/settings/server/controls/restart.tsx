import { render } from "../../../../shared/ui/tribute/dom";
import { getBase } from "../../../utils/net/base-url";
import { authHeaders } from "../../../utils/net/request";
import { confirmModal } from "../../../modules/modals/confirm-modal/confirm";
import { fetchRestartState } from "../../shared/restart-state";
import { RestartReasonItem } from "../restart-reason-item";

const t = window.scopedT("core");

let _restartSyncRun = 0;

export const syncRestartPending = async (
  getToken: () => string | null,
): Promise<void> => {
  const wrap = document.getElementById("settings-server-restart-pending");
  const list = document.getElementById("settings-server-restart-reasons");
  if (!wrap || !list) return;
  const run = ++_restartSyncRun;
  const state = await fetchRestartState(getToken);
  if (run !== _restartSyncRun) return;
  wrap.hidden = !state?.pending;
  render(
    <>
      {(state?.reasons ?? []).map((reason) => (
        <RestartReasonItem key={reason} reason={reason} />
      ))}
    </>,
    list,
  );
};

export const bindRestartButton = (getToken: () => string | null): void => {
  const btn = document.getElementById(
    "settings-server-restart",
  ) as HTMLButtonElement | null;
  if (!btn) return;

  const label = btn.textContent;
  btn.addEventListener("click", async () => {
    const confirmed = await confirmModal({
      title: t("settings-page.server.restart-button"),
      message: t("settings-page.server.restart-confirm"),
    });
    if (!confirmed) return;
    btn.disabled = true;
    btn.textContent = t("settings-page.server.restarting");
    try {
      const res = await fetch(`${getBase()}/api/settings/restart`, {
        method: "POST",
        headers: authHeaders(getToken),
      });
      if (!res.ok) throw new Error(`Restart failed: ${res.status}`);
    } catch (err) {
      console.debug("[settings] restart trigger failed", err);
      btn.textContent = label;
      btn.disabled = false;
    }
  });
};
