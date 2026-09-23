import { TransText } from "../../../shared/ui/components/primitives/trans-text";
import { StoreLinkButton } from "../shared/store-link-button";
import { render } from "../../../shared/ui/tribute/dom";
import { Button } from "../../../shared/ui/components/primitives/button";
import { Icon } from "../../../shared/ui/components/primitives/icon";
import { ExtGroup } from "../../../shared/ui/components/extensions/ext-group";
import { CompatSection } from "./compat-section";
import { EngineCard } from "./engine-card";
import { engineTypes, primaryType } from "./engine-types";
import { idbGet, idbSet } from "../../utils/db";
import { SETTINGS_KEY, TAB_ORDER_SAVED } from "../../constants";
import { resetDefaults } from "../../utils/sync";
import { ENGINE_SYNC_KEYS } from "../../../shared/sync";
import { confirmModal } from "../../modules/modals/confirm-modal/confirm";
import { openModal } from "../../modules/modals/settings-modal/modal";
import type { AllExtensions, ExtensionMeta } from "../../types/extension";
import type { EngineRecord } from "../../types/state";
import type { GroupEntry, TypeEntry } from "../../types/engines-tab";
import { getBase } from "../../utils/base-url";
import { getTabOrder, applyTabOrder } from "../../utils/tab-order";
import { getStoredToken } from "../../utils/settings-token";
import { openTabOrderModal } from "../shared/tab-order-modal";
import { typeLabel } from "./type-label";
import { openCompatModal } from "./compat-modal";
import { enabledLayers } from "./compat-api";

const t = window.scopedT("core");

let _orderSavedHandler: (() => void) | null = null;

const _groupByType = (engines: ExtensionMeta[]): GroupEntry[] => {
  const map = new Map<string, ExtensionMeta[]>();
  for (const engine of engines) {
    const key = primaryType(engineTypes(engine)).toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(engine);
  }
  return [...map.keys()]
    .sort((a, b) => {
      if (a === "web") return -1;
      if (b === "web") return 1;
      return a.localeCompare(b);
    })
    .map((key) => ({
      key,
      label: typeLabel(key),
      engines: map.get(key) ?? [],
    }));
};

const _allTypeEntries = (engines: ExtensionMeta[]): TypeEntry[] => {
  const seen = new Set<string>();
  const result: TypeEntry[] = [];
  for (const engine of engines) {
    for (const type of engineTypes(engine)) {
      const key = type.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ key, label: typeLabel(key) });
      }
    }
  }
  return result;
};

const _sortGroups = (groups: GroupEntry[], saved: string[]): GroupEntry[] => {
  if (!saved.length) return groups;
  const orderedKeys = applyTabOrder(
    groups.map((g) => g.key),
    saved,
  );
  return orderedKeys
    .map((k) => groups.find((g) => g.key === k))
    .filter((g): g is GroupEntry => g !== undefined);
};

export async function initEnginesTab(
  allExtensions: AllExtensions,
  options?: { publicInstance?: boolean },
): Promise<void> {
  const container = document.getElementById("engines-content");
  if (!container) return;
  const allowConfigure = !options?.publicInstance;

  const savedEngines = await idbGet<EngineRecord>(SETTINGS_KEY);
  const savedEnginesMap = savedEngines || {};
  const defaultsFromEngines = Object.fromEntries(
    allExtensions.engines.map((e) => [e.id, e.defaultEnabled !== false]),
  );
  const enabledMap: EngineRecord = {
    ...defaultsFromEngines,
    ...savedEnginesMap,
  };

  const layers = allowConfigure ? await enabledLayers() : [];
  const rawGroups = _groupByType(allExtensions.engines);
  const savedOrder = await getTabOrder();
  const groups = _sortGroups(rawGroups, savedOrder);
  const hasStoreEngines = allExtensions.engines.some(
    (e) => e.source !== "builtin",
  );

  const onToggle =
    (engine: ExtensionMeta) =>
    (event: Event): void => {
      enabledMap[engine.id] = (event.currentTarget as HTMLInputElement).checked;
      void idbSet(SETTINGS_KEY, enabledMap);
    };

  const _saveDefaults = async (): Promise<void> => {
    const btn = document.getElementById("save-default-engines");
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["x-settings-token"] = token;
      await fetch(`${getBase()}/api/settings/default-engines`, {
        method: "POST",
        headers,
        body: JSON.stringify(enabledMap),
      });
      await idbSet(SETTINGS_KEY, enabledMap);
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = t("settings-page.server.saved");
        setTimeout(() => {
          btn.textContent = prev;
        }, 1200);
      }
    } catch {
      if (btn) btn.textContent = t("settings-page.server.save-failed-network");
    }
  };

  const _resetDefaults = async (): Promise<void> => {
    const confirmed = await confirmModal({
      title: t("settings-page.extensions.reset-defaults"),
      message: t("settings-page.extensions.reset-confirm"),
    });
    if (!confirmed) return;
    await resetDefaults(ENGINE_SYNC_KEYS);
    await initEnginesTab(allExtensions, options);
  };

  const _openOrderModal = (): void => {
    const token = getStoredToken();
    void openTabOrderModal(_allTypeEntries(allExtensions.engines), token);
  };

  render(
    <>
      {allowConfigure ? (
        <section class="settings-section ext-card degoog-panel degoog-panel--ext-card">
          <div class="setting-section-heading-wrapper">
            <h2 class="settings-section-heading">
              {t("settings-page.extensions.tabs-heading")}
            </h2>
            <div class="floating-section-icon">
              <Icon name="fa-solid fa-table-columns" />
            </div>
          </div>
          <p class="settings-desc">{t("settings-page.extensions.tabs-desc")}</p>
          <div class="settings-page-actions">
            <Button
              variant="secondary"
              id="order-engine-tabs"
              onClick={_openOrderModal}
            >
              {t("settings-page.extensions.order-tabs")}
            </Button>
            <Button
              variant="secondary"
              id="save-default-engines"
              onClick={() => void _saveDefaults()}
            >
              {t("settings-page.extensions.save-defaults")}
            </Button>
            <Button
              variant="secondary"
              id="reset-default-engines"
              onClick={() => void _resetDefaults()}
            >
              {t("settings-page.extensions.reset-defaults")}
            </Button>
          </div>
        </section>
      ) : null}

      {layers.length > 0 ? (
        <CompatSection
          layers={layers}
          onOpen={(layer) => void openCompatModal(layer)}
        />
      ) : null}

      {groups.map(({ label, engines }) => (
        <ExtGroup key={label} label={label}>
          {engines.map((engine) => (
            <EngineCard
              key={engine.id}
              engine={engine}
              enabled={enabledMap[engine.id] !== false}
              allowConfigure={allowConfigure}
              onToggle={onToggle(engine)}
              onConfigure={() => openModal(engine)}
            />
          ))}
        </ExtGroup>
      ))}

      {!hasStoreEngines ? (
        <div class="ext-group">
          <p class="degoog-text degoog-text--sm degoog-text--secondary">
            <TransText
              text={t("settings-page.extensions.no-engines", {
                store: "{store}",
              })}
              slots={{
                store: (
                  <StoreLinkButton
                    label={t("settings-page.extensions.no-engines-store")}
                  />
                ),
              }}
            />
          </p>
        </div>
      ) : null}
    </>,
    container,
  );

  container
    .querySelector<HTMLButtonElement>("[data-switch-tab]")
    ?.addEventListener("click", (e) => {
      const tab = (e.currentTarget as HTMLButtonElement).dataset.switchTab;
      if (tab)
        document
          .querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)
          ?.click();
    });

  if (_orderSavedHandler) {
    window.removeEventListener(TAB_ORDER_SAVED, _orderSavedHandler);
  }
  const onOrderSaved = (): void => {
    window.removeEventListener(TAB_ORDER_SAVED, onOrderSaved);
    _orderSavedHandler = null;
    void initEnginesTab(allExtensions, options);
  };
  _orderSavedHandler = onOrderSaved;
  window.addEventListener(TAB_ORDER_SAVED, onOrderSaved);
}
