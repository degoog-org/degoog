import { authHeaders, jsonHeaders } from "../../utils/net/request";
import { getBase } from "../../utils/net/base-url";
import { isStoreEvent, type StoreStreamEvent } from "../../../shared/store-stream";
import { repoKey } from "./model";
import type { RepoInfo, StoreItem } from "../../types/store-tab";

type GetToken = () => string | null;

export interface StoreResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

const _get = async <T>(path: string, getToken: GetToken): Promise<T | null> => {
  const res = await fetch(`${getBase()}${path}`, { headers: authHeaders(getToken) });
  if (!res.ok) return null;
  return (await res.json()) as T;
};

export const fetchRepos = async (getToken: GetToken): Promise<RepoInfo[] | null> =>
  (await _get<{ repos?: RepoInfo[] }>("/api/store/repos", getToken))?.repos ?? null;

export const fetchItems = async (getToken: GetToken): Promise<StoreItem[] | null> =>
  (await _get<{ items?: StoreItem[] }>("/api/store/items", getToken))?.items ?? null;

export const fetchBehind = async (
  getToken: GetToken,
): Promise<Record<string, number> | null> => {
  const data = await _get<{ statuses?: Array<{ url: string; behind: number }> }>(
    "/api/store/repos/status",
    getToken,
  );
  if (!data) return null;
  const map: Record<string, number> = {};
  for (const s of data.statuses ?? []) map[repoKey(s.url)] = s.behind;
  return map;
};

export const sendStore = async <T = unknown>(
  path: string,
  body: Record<string, unknown>,
  getToken: GetToken,
  method: "POST" | "DELETE" = "POST",
): Promise<StoreResult<T>> => {
  try {
    const res = await fetch(`${getBase()}${path}`, {
      method,
      headers: jsonHeaders(getToken),
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return res.ok ? { ok: true, data } : { ok: false, error: data.error };
  } catch (err) {
    console.debug("[store] request failed", path, err);
    return { ok: false };
  }
};

export const streamStoreOp = (
  path: string,
  event: string,
  onEvent: (e: StoreStreamEvent) => void,
): Promise<{ failed: number } | null> =>
  new Promise((resolve) => {
    const source = new EventSource(`${getBase()}${path}`);
    let failed = 0;
    source.addEventListener(event, (e) => {
      const data: unknown = JSON.parse((e as MessageEvent).data);
      if (!isStoreEvent(data)) return;
      if (data.phase === "failed") failed++;
      onEvent(data);
    });
    source.addEventListener("done", (e) => {
      source.close();
      let data: unknown = null;
      try {
        data = JSON.parse((e as MessageEvent).data);
      } catch (err) {
        console.warn("[store] unreadable stream summary", err);
      }
      const reported =
        typeof data === "object" &&
        data !== null &&
        typeof (data as { failed?: unknown }).failed === "number"
          ? (data as { failed: number }).failed
          : failed;
      resolve({ failed: reported });
    });
    source.addEventListener("failed", () => {
      source.close();
      resolve(null);
    });
    source.onerror = () => {
      source.close();
      resolve(null);
    };
  });
