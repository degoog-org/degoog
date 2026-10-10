import { getBase } from "../../../utils/net/base-url";
import { authHeaders } from "../../../utils/net/request";
import { VALKEY_ALERT_ID } from "../render/valkey-alert";

const UNREACHABLE = "unreachable";

let _valkeySyncRun = 0;

const fetchValkeyStatus = async (
  getToken: () => string | null,
): Promise<string | null> => {
  try {
    const res = await fetch(`${getBase()}/api/settings/valkey-status`, {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { status?: unknown };
    return typeof payload.status === "string" ? payload.status : null;
  } catch (err) {
    console.debug("[settings] valkey status fetch failed", err);
    return null;
  }
};

export const syncValkeyAlert = async (
  getToken: () => string | null,
): Promise<void> => {
  const alert = document.getElementById(VALKEY_ALERT_ID);
  if (!alert) return;
  const run = ++_valkeySyncRun;
  const status = await fetchValkeyStatus(getToken);
  if (run !== _valkeySyncRun) return;
  alert.hidden = status !== UNREACHABLE;
};
