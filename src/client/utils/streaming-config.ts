import { getBase } from "./base-url";

let _config: { enabled: boolean; disabledTypes: string[] } | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("extensions-saved", () => {
    _config = null;
  });
}

export const fetchStreamingConfig = async (): Promise<{ enabled: boolean; disabledTypes: string[] }> => {
  if (_config) return _config;
  try {
    const res = await fetch(`${getBase()}/api/settings/streaming`);
    if (res.ok) {
      const data = (await res.json()) as { enabled: boolean; disabledTypes?: string[] };
      _config = { enabled: data.enabled, disabledTypes: data.disabledTypes ?? [] };
      return _config;
    }
  } catch (err) {
    console.debug("[streaming] config fetch failed", err);
  }
  return { enabled: false, disabledTypes: [] };
};
