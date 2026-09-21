import { render } from "../../../shared/ui/core/dom";
import { ExtGroup } from "../../../shared/ui/components/extensions/ext-group";
import type { ExtensionMeta, AllExtensions } from "../../types";
import { TransportCard } from "./transport-card";

const t = window.scopedT("core");

const BUILTIN_IDS = new Set([
  "transport-fetch",
  "transport-curl",
  "transport-curl-impersonate",
  "transport-curl-fallback",
]);

export function initTransportsTab(allExtensions: AllExtensions): void {
  const container = document.getElementById("transports-content");
  if (!container) return;

  const transports = allExtensions.transports ?? [];
  const custom = transports.filter((transport) => !BUILTIN_IDS.has(transport.id));
  const builtin = transports.filter((transport) => BUILTIN_IDS.has(transport.id));

  const group = (labelKey: string, items: ExtensionMeta[]): JSX.Element | null =>
    items.length === 0 ? null : (
      <ExtGroup label={t(labelKey)}>
        {items.map((transport) => (
          <TransportCard key={transport.id} transport={transport} />
        ))}
      </ExtGroup>
    );

  render(
    [
      group("settings-page.extensions.group-transports", custom),
      group("settings-page.extensions.group-builtin-transports", builtin),
    ].filter((node) => node !== null),
    container,
  );
}
