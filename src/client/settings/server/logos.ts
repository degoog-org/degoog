import { LOGO_STATUS, type LogoStatusResponse } from "../../../shared/daily-logo";
import { getBase } from "../../utils/net/base-url";
import { authHeaders } from "../../utils/net/request";

const t = window.scopedT("core");

export const LOGOS_SAVED_EVENT = "logos-saved";

const _statusText = ({ status, title }: LogoStatusResponse): string =>
  title ?? t(`settings-page.server.logos-status-${status}`);

const _request = async (
  path: string,
  getToken: () => string | null,
  method = "GET",
): Promise<LogoStatusResponse> => {
  const res = await fetch(`${getBase()}/api/settings/logos${path}`, {
    method,
    headers: authHeaders(getToken),
  });
  if (!res.ok) throw new Error(`logos ${path || "status"} answered ${res.status}`);
  return (await res.json()) as LogoStatusResponse;
};

export const initLogosControls = (getToken: () => string | null): void => {
  const status = document.getElementById("settings-logos-status");
  const button = document.getElementById("settings-logos-refresh") as HTMLButtonElement | null;
  if (!status || !button) return;

  const show = (data: LogoStatusResponse): void => {
    status.textContent = _statusText(data);
  };

  const load = async (): Promise<void> => {
    try {
      show(await _request("", getToken));
    } catch (err) {
      console.warn("[settings] logo status load failed", err);
    }
  };

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    show({ status: LOGO_STATUS.LOADING });
    try {
      show(await _request("/refresh", getToken, "POST"));
    } catch (err) {
      console.warn("[settings] logo refresh failed", err);
      show({ status: LOGO_STATUS.FAILED });
    } finally {
      button.disabled = false;
    }
  });

  window.addEventListener(LOGOS_SAVED_EVENT, () => void load());
  void load();
};
