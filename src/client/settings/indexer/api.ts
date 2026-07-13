import { getBase } from "../../utils/base-url";
import { authHeaders, jsonHeaders } from "../../utils/request";
import { getStoredToken } from "../../utils/settings-token";
import type { DeleteItem, RowsResponse } from "../../types/indexer";

export const MANAGE_PAGE_SIZE = 20;

export const DEGOOG_ENGINE_ID = "degoog-engine";

export const IMPORT_CUSTOM_TYPE = "__custom__";

export const fetchRows = async (
  q: string,
  page: number,
  type?: string,
): Promise<RowsResponse | null> => {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(MANAGE_PAGE_SIZE),
    });
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    const res = await fetch(`${getBase()}/api/indexer/rows?${params.toString()}`, {
      headers: authHeaders(getStoredToken),
    });
    if (!res.ok) return null;
    return (await res.json()) as RowsResponse;
  } catch {
    return null;
  }
};

export const deleteRows = async (items: DeleteItem[]): Promise<boolean> => {
  if (items.length === 0) return false;
  try {
    const res = await fetch(`${getBase()}/api/indexer/rows/delete`, {
      method: "POST",
      headers: jsonHeaders(getStoredToken),
      body: JSON.stringify({ items }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

export const orderTypes = (types: string[]): string[] =>
  [...types].sort((a, b) => {
    if (a === "web") return -1;
    if (b === "web") return 1;
    return a.localeCompare(b);
  });

export const fetchEngineTypes = async (): Promise<string[]> => {
  try {
    const res = await fetch(`${getBase()}/api/engines`);
    if (!res.ok) return [];
    const data = (await res.json()) as { engines: { id: string; searchTypes: string[] }[] };
    const seen = new Set<string>();
    for (const eng of data.engines) {
      if (eng.id === DEGOOG_ENGINE_ID) continue;
      for (const st of eng.searchTypes) seen.add(st);
    }
    return orderTypes([...seen]);
  } catch {
    return [];
  }
};
