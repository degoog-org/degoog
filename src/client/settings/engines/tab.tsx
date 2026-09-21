import { renderHtml } from "../../../shared/ui/core/html";
import { StoreLinkButton } from "./store-link-button";
import { render } from "../../../shared/ui/core/dom";
import { raw } from "../../../shared/ui/core/raw";
import { Badge } from "../../../shared/ui/components/primitives/badge";
import { Button } from "../../../shared/ui/components/primitives/button";
import { Icon } from "../../../shared/ui/components/primitives/icon";
import { ExtCard } from "../../../shared/ui/components/extensions/ext-card";
import { ExtCardDesc } from "../../../shared/ui/components/extensions/ext-card-desc";
import { ExtCardName } from "../../../shared/ui/components/extensions/ext-card-name";
import { ExtGroup } from "../../../shared/ui/components/extensions/ext-group";
import { ExtToggle } from "../../../shared/ui/components/extensions/ext-toggle";
import { idbGet, idbSet } from "../../utils/db";
import { SETTINGS_KEY, TAB_ORDER_SAVED } from "../../constants";
import { resetDefaults } from "../../utils/sync";
import { ENGINE_SYNC_KEYS } from "../../../shared/sync";
import { confirmModal } from "../../modules/modals/confirm-modal/confirm";
import { openModal } from "../../modules/modals/settings-modal/modal";
import type { ExtensionMeta, EngineRecord, AllExtensions } from "../../types";
import type { GroupEntry, TypeEntry } from "../../types/engines-tab";
import { getBase } from "../../utils/base-url";
import { renderMdInline } from "../../utils/md";
import { getTabOrder, applyTabOrder } from "../../utils/tab-order";
import { getStoredToken } from "../../utils/settings-token";
import { openTabOrderModal } from "../shared/tab-order-modal";
import {
  extCardBadgeNode,
  extCardRestartWarningNode,
  extCardVersionWarningNode,
} from "../shared/ext-card";
import { typeLabel } from "./type-label";
import { openCompatModal } from "./compat-modal";
import { enabledLayers, type CompatLayerView } from "./compat-api";

const t = window.scopedT("core");

let _orderSavedHandler: (() => void) | null = null;

const _layerBtnId = (layer: CompatLayerView): string => `open-compat-${layer.id}`;

const COMPAT_NOTES = [
  "compat-note-native",
  "compat-note-upstream",
  "compat-note-updates",
  "compat-note-needs",
];


const CompatSection = ({
  layers,
  onOpen,
}: {
  layers: CompatLayerView[];
  onOpen: (layer: CompatLayerView) => void;
}): JSX.Element => (
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card">
    <div class="setting-section-heading-wrapper">
      <h2 class="settings-section-heading">
        {t("settings-page.extensions.compat-heading")}
        <Badge modifier="experimental">{t("settings-page.extensions.compat-experimental")}</Badge>
      </h2>
      <div class="floating-section-icon">
        <Icon name="fa-solid fa-flask" />
      </div>
    </div>
    <p class="settings-desc">{t("settings-page.extensions.compat-desc")}</p>
    <div class="compat-note">
      <ul class="compat-note-list">
        {COMPAT_NOTES.map((key) => (
          <li>{t(`settings-page.extensions.${key}`)}</li>
        ))}
      </ul>
    </div>
    <div class="settings-page-actions">
      {layers.map((layer) => (
        <Button variant="secondary" id={_layerBtnId(layer)} onClick={() => onOpen(layer)}>
          {t("settings-page.extensions.compat-open", { layer: layer.label })}
        </Button>
      ))}
    </div>
  </section>
);

const _engineTypes = (engine: ExtensionMeta): string[] => {
  if (engine.searchTypes?.length) return engine.searchTypes;
  return [engine.primaryType ?? "web"];
};

const _primaryType = (types: string[]): string =>
  types.length > 0 ? types[0] : "web";

const _groupByType = (engines: ExtensionMeta[]): GroupEntry[] => {
  const map = new Map<string, ExtensionMeta[]>();
  for (const engine of engines) {
    const key = _primaryType(_engineTypes(engine)).toLowerCase();
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
    for (const type of _engineTypes(engine)) {
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

const _extraTypeLabels = (engine: ExtensionMeta): string[] => {
  const types = _engineTypes(engine);
  const primary = _primaryType(types).toLowerCase();
  return types
    .filter((type) => type.toLowerCase() !== primary)
    .map((type) => typeLabel(type.toLowerCase()));
};


const EngineCard = ({
  engine,
  enabled,
  allowConfigure,
  onToggle,
  onConfigure,
}: {
  engine: ExtensionMeta;
  enabled: boolean;
  allowConfigure: boolean;
  onToggle: (event: Event) => void;
  onConfigure: () => void;
}): JSX.Element => {
  const toggleId = `engine-toggle-${engine.id}`;
  const extraTypes = _extraTypeLabels(engine);

  return (
    <ExtCard
      id={engine.id}
      nameRow={[
        extCardRestartWarningNode(engine),
        <ExtCardName htmlFor={toggleId} class="engine-toggle-label" name={engine.displayName} />,
        engine.compatibilityLayer ? (
          <Badge modifier="engine-type">{engine.compatibilityLayer}</Badge>
        ) : null,
      ]}
      info={[
        engine.description ? <ExtCardDesc html={raw(renderMdInline(engine.description))} /> : null,
        extraTypes.length ? (
          <div class="ext-card-extra-types">
            <span class="ext-card-extra-types-label">
              {t("settings-page.extensions.extra-types")}
            </span>
            {extraTypes.map((label) => (
              <Badge modifier="engine-type">{label}</Badge>
            ))}
          </div>
        ) : null,
        extCardVersionWarningNode(engine),
      ]}
      actions={[
        allowConfigure ? extCardBadgeNode(engine) : null,
        allowConfigure && engine.configurable ? (
          <Button variant="secondary" class="ext-card-configure" data-id={engine.id} onClick={onConfigure}>
            {t("settings-page.extensions.configure")}
          </Button>
        ) : null,
        <ExtToggle
          id={toggleId}
          inputClass="engine-toggle-input"
          dataId={engine.id}
          checked={enabled}
          onChange={onToggle}
        />,
      ]}
    />
  );
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
  const hasStoreEngines = allExtensions.engines.some((e) => e.source !== "builtin");

  const onToggle = (engine: ExtensionMeta) => (event: Event): void => {
    enabledMap[engine.id] = (event.currentTarget as HTMLInputElement).checked;
    void idbSet(SETTINGS_KEY, enabledMap);
  };

  const _saveDefaults = async (): Promise<void> => {
    const btn = document.getElementById("save-default-engines");
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
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
            <h2 class="settings-section-heading">{t("settings-page.extensions.tabs-heading")}</h2>
            <div class="floating-section-icon">
              <Icon name="fa-solid fa-table-columns" />
            </div>
          </div>
          <p class="settings-desc">{t("settings-page.extensions.tabs-desc")}</p>
          <div class="settings-page-actions">
            <Button variant="secondary" id="order-engine-tabs" onClick={_openOrderModal}>
              {t("settings-page.extensions.order-tabs")}
            </Button>
            <Button variant="secondary" id="save-default-engines" onClick={() => void _saveDefaults()}>
              {t("settings-page.extensions.save-defaults")}
            </Button>
            <Button variant="secondary" id="reset-default-engines" onClick={() => void _resetDefaults()}>
              {t("settings-page.extensions.reset-defaults")}
            </Button>
          </div>
        </section>
      ) : null}

      {layers.length > 0 ? (
        <CompatSection layers={layers} onOpen={(layer) => void openCompatModal(layer)} />
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
            {raw(
              t("settings-page.extensions.no-engines", {
                store: renderHtml(
                  <StoreLinkButton
                    label={t("settings-page.extensions.no-engines-store")}
                  />,
                ),
              }),
            )}
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
      if (tab) document.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.click();
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
