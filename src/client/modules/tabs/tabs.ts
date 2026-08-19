import { state } from "../../state";
import { getBase } from "../../utils/base-url";
import { performSearch } from "../../utils/search-actions";
import { getEnabledSearchTypes } from "../../utils/engines";
import { getBangMatchType } from "../../utils/navigation";
import { performTabSearch } from "./tab-search";
import { getTabOrder, applyTabOrder } from "../../utils/tab-order";
import { TAB_ORDER_SAVED } from "../../constants";

interface TabInfo {
  id: string;
  name: string;
  icon: string | null;
}

let pluginTabs: TabInfo[] = [];
let tabsReady: Promise<void> | null = null;

export function initTabs(): void {
  document.querySelectorAll<HTMLElement>(".results-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const type = tab.dataset.type;
      if (state.currentQuery && type) {
        if (type.startsWith("tab:")) {
          void performTabSearch(state.currentQuery, type.slice(4));
        } else {
          void performSearch(state.currentQuery, type);
        }
      }
    });
  });

  tabsReady = _loadPluginTabs();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void _loadPluginTabs();
  });

  window.addEventListener("extensions-saved", () => {
    void _loadPluginTabs();
  });

  window.addEventListener(TAB_ORDER_SAVED, () => {
    void getTabOrder().then(_reorderDomTabs);
  });
}

const _tabKey = (el: HTMLElement): string => {
  const type = el.dataset.type ?? "";
  if (type === "web") return "web";
  if (type.startsWith("tab:engine:")) return type.slice(11);
  if (type.startsWith("tab:")) return type.slice(4);
  return type;
};

const _reorderDomTabs = (order: string[]): void => {
  const container = document.getElementById("results-tabs");
  const toolsBar = document.getElementById("tools-bar");
  if (!container || !toolsBar || !order.length) return;

  const tabs = Array.from(container.querySelectorAll<HTMLElement>(".results-tab"));
  const byKey = new Map<string, HTMLElement>();
  for (const tab of tabs) byKey.set(_tabKey(tab), tab);

  for (const key of applyTabOrder([...byKey.keys()], order)) {
    const el = byKey.get(key);
    if (el) container.insertBefore(el, toolsBar);
  }
};

const _tabOrderKey = (tab: TabInfo): string => {
  if (tab.id.startsWith("engine:")) return tab.id.slice(7);
  return tab.id;
};

const _loadPluginTabs = async (): Promise<void> => {
  try {
    const [res, enabledTypes, savedOrder] = await Promise.all([
      fetch(`${getBase()}/api/search-tabs`),
      getEnabledSearchTypes(),
      getTabOrder(),
    ]);
    if (!res.ok) return;
    const data = (await res.json()) as { tabs: TabInfo[] };
    const filtered = (data.tabs || []).filter((tab) => {
      if (!tab.id.startsWith("engine:")) return true;
      return enabledTypes.has(tab.id.slice(7));
    });

    const orderedKeys = applyTabOrder(filtered.map(_tabOrderKey), savedOrder);
    pluginTabs = orderedKeys
      .map((k) => filtered.find((t) => _tabOrderKey(t) === k))
      .filter((t): t is TabInfo => t !== undefined);

    _renderPluginTabs();
    _reorderDomTabs(savedOrder);
  } catch (err) {
    console.debug("[tabs] plugin tabs load failed", err);
  }
};

function _renderPluginTabs(): void {
  const tabsContainer = document.getElementById("results-tabs");
  const toolsWrap = document.getElementById("tools-bar");
  if (!tabsContainer || !toolsWrap) return;

  tabsContainer
    .querySelectorAll(".results-tab[data-plugin-tab]")
    .forEach((el) => el.remove());

  const bangMatchType = getBangMatchType();

  for (const tab of pluginTabs) {
    const el = document.createElement("div");
    el.className = "results-tab degoog-tab";
    el.dataset.type = `tab:${tab.id}`;
    el.dataset.pluginTab = "true";
    el.textContent = tab.name;

    if (bangMatchType !== undefined) {
      const tabType = el.dataset.type ?? "";
      const visible =
        bangMatchType !== null &&
        (tabType === bangMatchType || tabType === `tab:engine:${bangMatchType}`);
      el.dataset.bangHidden = visible ? "" : "true";
      if (!visible) el.style.display = "none";
    }

    tabsContainer.insertBefore(el, toolsWrap);

    el.addEventListener("click", () => {
      if (state.currentQuery) {
        void performTabSearch(state.currentQuery, tab.id);
      }
    });
  }
}

export function reloadPluginTabs(): void {
  void _loadPluginTabs();
}

export const getPluginTabIds = async (): Promise<Set<string>> => {
  if (tabsReady) await tabsReady;
  const ids = new Set<string>();
  for (const tab of pluginTabs) {
    ids.add(tab.id);
    if (tab.id.startsWith("engine:")) ids.add(tab.id.slice(7));
  }
  return ids;
};
