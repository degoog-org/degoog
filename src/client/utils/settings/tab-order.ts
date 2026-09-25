import { getBase } from "../net/base-url";

export const getTabOrder = async (): Promise<string[]> => {
  try {
    const res = await fetch(`${getBase()}/api/settings/tab-order`);
    if (!res.ok) return [];
    const data = (await res.json()) as { engineTabsOrder?: unknown };
    return Array.isArray(data.engineTabsOrder)
      ? (data.engineTabsOrder as string[])
      : [];
  } catch {
    return [];
  }
};

export const saveTabOrder = async (
  order: string[],
  token: string | null,
): Promise<void> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["x-settings-token"] = token;
  await fetch(`${getBase()}/api/settings/tab-order`, {
    method: "POST",
    headers,
    body: JSON.stringify({ engineTabsOrder: order }),
  });
};

export const applyTabOrder = (types: string[], saved: string[]): string[] => {
  if (!saved.length) return types;
  const seen = new Set(saved);
  const ordered = saved.filter((k) => types.includes(k));
  const rest = types.filter((k) => !seen.has(k));
  return [...ordered, ...rest];
};
