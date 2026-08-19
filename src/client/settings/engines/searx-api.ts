import { authHeaders, jsonHeaders } from "../../utils/request";
import { getBase } from "../../utils/base-url";
import { getStoredToken } from "../../utils/settings-token";
import type { SearxCatalogItem } from "../../types/searx-catalog";

export enum SearxAction {
  Install = "install",
  Update = "update",
  Uninstall = "uninstall",
}

export const searxOn = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${getBase()}/api/settings/general`, {
      headers: authHeaders(getStoredToken),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { searxCompatEnabled?: boolean | string };
    return data.searxCompatEnabled === true || data.searxCompatEnabled === "true";
  } catch (err) {
    console.warn("[settings] searx compatibility flag load failed", err);
    return false;
  }
};

export const fetchSearx = async (): Promise<SearxCatalogItem[]> => {
  const res = await fetch(`${getBase()}/api/searx/engines`, {
    headers: authHeaders(getStoredToken),
  });
  if (!res.ok) throw new Error("Failed to load the SearX catalogue");
  const data = (await res.json()) as { engines?: SearxCatalogItem[] };
  return data.engines ?? [];
};

export const sendSearx = async (
  action: SearxAction,
  code: string,
): Promise<void> => {
  const res = await fetch(`${getBase()}/api/searx/${action}`, {
    method: "POST",
    headers: jsonHeaders(getStoredToken),
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `SearX ${action} failed`);
  }
};
