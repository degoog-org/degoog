import { getBase } from "../../utils/net/base-url";
import { authHeaders } from "../../utils/net/request";

const t = window.scopedT("core");

export const LOGOS_SAVED_EVENT = "logos-saved";

interface LogoStatusResponse {
  status: string;
  title?: string;
}

const _statusText = (data: LogoStatusResponse): string =>
  data.status === "ok"
    ? t("settings-page.server.logos-status-ok", { title: data.title ?? "" })
    : t(`settings-page.server.logos-status-${data.status}`);

export const initLogosControls = (getToken: () => string | null): void => {
  const status = document.getElementById("settings-logos-status");
  const button = document.getElementById("settings-logos-refresh") as HTMLButtonElement | null;
  if (!status || !button) return;

  const show = (data: LogoStatusResponse): void => {
    status.textContent = _statusText(data);
  };

  const load = async (): Promise<void> => {
    try {
      const res = await fetch(`${getBase()}/api/settings/logos`, {
        headers: authHeaders(getToken),
      });
      if (res.ok) show((await res.json()) as LogoStatusResponse);
    } catch (err) {
      console.warn("[settings] logo status load failed", err);
    }
  };

  button.addEventListener("click", async () => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = t("settings-page.server.logos-status-loading");
    try {
      const res = await fetch(`${getBase()}/api/settings/logos/refresh`, {
        method: "POST",
        headers: authHeaders(getToken),
      });
      if (!res.ok) throw new Error(`logo refresh answered ${res.status}`);
      show((await res.json()) as LogoStatusResponse);
    } catch (err) {
      console.warn("[settings] logo refresh failed", err);
      show({ status: "failed" });
    } finally {
      button.disabled = false;
    }
  });

  window.addEventListener(LOGOS_SAVED_EVENT, () => void load());
  void load();
};
