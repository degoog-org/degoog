import type { TransportFetchOptions } from "../../types/extension";
import { logger } from "../logger";
import { isSafeHost, type LocalImageAccess } from "./ssrf";

const MAX_REDIRECT_HOPS = 5;

const _isSafeTarget = async (
  target: string,
  access: LocalImageAccess | undefined,
): Promise<boolean> => {
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return await isSafeHost(parsed.hostname, access);
  } catch (err) {
    logger.debug("ssrf", `invalid redirect URL ${target}`, err);
    return false;
  }
};

export const fetchWithSafeRedirects = async (
  fetchFn: (url: string, init: TransportFetchOptions) => Promise<Response>,
  initial: string,
  init: TransportFetchOptions,
  access?: LocalImageAccess,
): Promise<Response | null> => {
  let target = initial;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (!(await _isSafeTarget(target, access))) return null;
    const res = await fetchFn(target, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get("location");
    if (!loc) return res;
    try {
      target = new URL(loc, target).toString();
    } catch (err) {
      logger.debug("ssrf", `invalid redirect location ${loc}`, err);
      return null;
    }
  }
  return null;
};
