import { state } from "../../state";
import { getBase } from "../../utils/base-url";
import { performSearch } from "../../utils/search-actions";
import { getEnabledSearchTypes } from "../../utils/engines";
import { getBangMatchType, setTabTypeDisabled } from "../../utils/navigation";
import { performTabSearch } from "./tab-search";

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
  void _refreshBuiltinTabVisibility();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void _loadPluginTabs();
  });

  window.addEventListener("extensions-saved", () => {
    void _loadPluginTabs();
    void _refreshBuiltinTabVisibility();
  });
}

const BUILTIN_FILTERABLE_TYPES = ["images", "videos", "news"] as const;

async function _refreshBuiltinTabVisibility(): Promise<void> {
  try {
    const enabled = await getEnabledSearchTypes();
    for (const type of BUILTIN_FILTERABLE_TYPES) {
      setTabTypeDisabled(type, !enabled.has(type));
    }
  } catch {}
}

const _loadPluginTabs = async (): Promise<void> => {
  try {
    const [res, enabledTypes] = await Promise.all([
      fetch(`${getBase()}/api/search-tabs`),
      getEnabledSearchTypes(),
    ]);
    if (!res.ok) return;
    const data = (await res.json()) as { tabs: TabInfo[] };
    pluginTabs = (data.tabs || []).filter((tab) => {
      if (!tab.id.startsWith("engine:")) return true;
      return enabledTypes.has(tab.id.slice(7));
    });
    _renderPluginTabs();
  } catch {}
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
