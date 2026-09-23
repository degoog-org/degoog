import { listSearchTabs } from "../search/tab-list";
import type { NojsTab } from "./context";

export const WEB_TAB_ID = "web";
export const TAB_TYPE_PREFIX = "tab:";
export const ENGINE_TYPE_PREFIX = "engine:";

export const nojsTabType = (tabId: string): string =>
  tabId === WEB_TAB_ID ? WEB_TAB_ID : `${TAB_TYPE_PREFIX}${tabId}`;

export const stripTabTypePrefix = (type: string): string =>
  type.startsWith(TAB_TYPE_PREFIX) ? type.slice(TAB_TYPE_PREFIX.length) : type;

export const listNojsTabs = async (webLabel: string): Promise<NojsTab[]> => {
  const tabs = await listSearchTabs();
  return [
    { id: WEB_TAB_ID, name: webLabel },
    ...tabs.map((tab) => ({ id: tab.id, name: tab.name })),
  ];
};
