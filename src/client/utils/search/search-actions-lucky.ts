import { getEngines } from "../engines";
import { getBase } from "../base-url";

export async function performLucky(query: string): Promise<void> {
  if (!query.trim()) return;
  const engines = await getEngines();
  const params = new URLSearchParams({ q: query });
  for (const [key, val] of Object.entries(engines)) {
    params.set(key, String(val));
  }
  window.location.href = `${getBase()}/api/lucky?${params.toString()}`;
}
