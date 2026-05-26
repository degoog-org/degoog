import { getInterceptors } from "../extensions/interceptors/registry";
import { createCache, useCache } from "./cache";
import { outgoingFetch } from "./outgoing";
import { logger } from "./logger";
import { isDisabled } from "./plugin-settings";
import type { InterceptorOverrides } from "../types/extension";

export const runIntercepts = async (
  query: string,
  lang?: string,
): Promise<{ query: string; overrides: InterceptorOverrides }> => {
  const interceptors = getInterceptors();
  if (interceptors.length === 0) return { query, overrides: {} };

  let current = query;
  const merged: InterceptorOverrides = {};

  for (const interceptor of interceptors) {
    const sid = interceptor.settingsId;
    if (sid && (await isDisabled(sid))) continue;

    try {
      const result = await interceptor.intercept(current, {
        fetch: outgoingFetch as (url: string, init?: RequestInit) => Promise<Response>,
        createCache,
        useCache,
        lang,
      });
      current = result.query;
      if (result.overrides) Object.assign(merged, result.overrides);
    } catch (err) {
      logger.debug("interceptors", `${interceptor.name} threw`, err);
    }
  }

  return { query: current, overrides: merged };
};
