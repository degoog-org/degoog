import type { AutocompleteContext } from "../../types";
import { asBoolean, asString, getSettings } from "../../utils/plugin-settings";
import { outgoingFetch, parseOutgoingTransport } from "../../utils/outgoing";
import { createCache, useCache } from "../../utils/cache";
import { getRandomUserAgent } from "../../utils/user-agents";
import { getInstanceSettings } from "../../utils/server-settings";

const _resolveLang = (
  globalSettings: Record<string, string | string[] | boolean>,
): string => {
  if (asBoolean(globalSettings.languagesEnabled)) {
    const first = asString(globalSettings.languages ?? "")
      .split(/[\n,]/)
      .map((s) => s.trim().toLowerCase())
      .find((s) => /^[a-z]{2,3}$/.test(s));
    if (first) return first;
  }
  return (
    (process.env.DEGOOG_DEFAULT_SEARCH_LANGUAGE || "")
      .trim()
      .split(/[-_]/)[0]
      .toLowerCase() || "en"
  );
};

export const buildProviderContext = async (
  providerId: string,
): Promise<AutocompleteContext> => {
  const stored = await getSettings(providerId);
  const raw = asString(stored.outgoingTransport) || undefined;
  const transportName = parseOutgoingTransport(raw);
  const globalSettings = await getInstanceSettings();
  return {
    fetch: (url, init) =>
      outgoingFetch(
        url as string,
        (init ?? {}) as Parameters<typeof outgoingFetch>[1],
        transportName,
      ),
    lang: _resolveLang(globalSettings),
    userAgent: () => getRandomUserAgent(),
    createCache,
    useCache,
  };
};
