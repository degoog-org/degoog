import { render } from "../../../shared/ui/tribute/dom";
import { ExtGroup } from "../../../shared/ui/components/extensions/ext-group";
import type { AllExtensions, ExtensionMeta } from "../../types/extension";
import { TransportCard } from "./transport-card";
import { ExtFilterBar, extFilterIds } from "../shared/filter/ext-filter-bar";
import { ExtNoMatch } from "../shared/filter/ext-no-match";
import {
  countItems,
  createExtFilter,
  createExtFilterActions,
  filterExtGroups,
  settingsIsOn,
} from "../shared/filter/ext-filter";
import { revealActiveTab } from "../shared/filter/filter-tabs";
import type { ExtFilterGroup } from "../../types/ext-filter";

const t = window.scopedT("core");

const BUILTIN_IDS = new Set([
  "transport-fetch",
  "transport-curl",
  "transport-curl-impersonate",
  "transport-curl-fallback",
]);

export function initTransportsTab(allExtensions: AllExtensions): void {
  const host = document.getElementById("transports-content");
  if (!host) return;
  const container: HTMLElement = host;

  const transports = allExtensions.transports ?? [];
  const groups: ExtFilterGroup[] = [
    {
      key: "custom",
      label: t("settings-page.extensions.group-transports"),
      items: transports.filter((transport) => !BUILTIN_IDS.has(transport.id)),
    },
    {
      key: "builtin",
      label: t("settings-page.extensions.group-builtin-transports"),
      items: transports.filter((transport) => BUILTIN_IDS.has(transport.id)),
    },
  ].filter((group) => group.items.length > 0);
  const filter = createExtFilter();
  const ids = extFilterIds("transports");
  const actions = createExtFilterActions(filter, () => paint(), ids);

  const setEnabled = (transport: ExtensionMeta, on: boolean): void => {
    transport.settings = { ...transport.settings, disabled: on ? "" : "true" };
    paint();
  };

  function paint(): void {
    const visible = filterExtGroups(groups, filter, settingsIsOn);
    render(
      <>
        <ExtFilterBar
          noun="transports"
          ids={ids}
          groups={groups}
          shown={countItems(visible)}
          filter={filter}
          isOn={settingsIsOn}
          actions={actions}
        />
        {visible.length ? null : <ExtNoMatch filter={filter} onClear={actions.clear} />}
        {visible.map((group) => (
          <ExtGroup key={group.key} label={group.label}>
            {group.items.map((transport) => (
              <TransportCard
                key={transport.id}
                transport={transport}
                onSaved={(on) => setEnabled(transport, on)}
              />
            ))}
          </ExtGroup>
        ))}
      </>,
      container,
    );
    revealActiveTab(ids.tabs);
  }

  paint();
}
