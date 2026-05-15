import { getBase } from "./base-url";

let _config: { enabled: boolean } | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("extensions-saved", () => {
    _config = null;
  });
}

export const fetchStreamingConfig = async (): Promise<boolean> => {
  if (_config) return _config.enabled;
  try {
    const res = await fetch(`${getBase()}/api/settings/streaming`);
    if (res.ok) {
      _config = (await res.json()) as { enabled: boolean };
      return _config.enabled;
    }
  } catch {}
  return false;
};
