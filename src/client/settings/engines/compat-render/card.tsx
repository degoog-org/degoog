import { Button } from "../../../../shared/ui/components/primitives/button";
import { CompatIcon } from "./icon";
import { CompatMetaRow } from "./meta-row";
import { CompatUpdateButton, type CompatListUi } from "./update-button";
import { compatPackages } from "./grouping";
import { copy, WEB_TYPE } from "./copy";
import { typeLabel } from "../type-label";
import type { Child } from "../../../../shared/ui/tribute/types";
import type { CompatCatalogItem } from "../../../../shared/compat-layers";

const _metaRows = (item: CompatCatalogItem, layer: string): Child[] => {
  const rows: Child[] = [];
  const primary = (item.types[0] ?? WEB_TYPE).toLowerCase();
  const extras = item.types.filter((type) => type.toLowerCase() !== primary);
  if (extras.length) {
    rows.push(
      <CompatMetaRow
        label={copy("compat-types-label", layer)}
        value={extras.map((type) => typeLabel(type.toLowerCase())).join(", ")}
        hint={copy("compat-types-hint", layer)}
        layer={layer}
      />,
    );
  }
  if (item.runtime.length) {
    rows.push(
      <CompatMetaRow
        label={copy("compat-runtime-label", layer)}
        value={item.runtime.map((need) => need.module).join(", ")}
        hint={copy("compat-runtime-hint", layer)}
        layer={layer}
        missing={compatPackages(item).length > 0}
      />,
    );
  }
  const deps = item.deps ?? [];
  if (deps.length) {
    rows.push(
      <CompatMetaRow
        label={copy("compat-shared-label", layer)}
        value={deps.join(", ")}
        hint={copy("compat-shared-hint", layer)}
        layer={layer}
      />,
    );
  }
  const notes = item.notes ?? [];
  if (notes.length) {
    rows.push(
      <CompatMetaRow
        label={copy("compat-notes-label", layer)}
        value={notes
          .map((note) => copy(`compat-note-${note}`, layer))
          .join(", ")}
        hint={copy("compat-notes-hint", layer)}
        layer={layer}
      />,
    );
  }
  return rows;
};

export const CompatCard = ({
  item,
  layer,
  ui,
}: {
  item: CompatCatalogItem;
  layer: string;
  ui?: CompatListUi;
}): JSX.Element => {
  const rows = _metaRows(item, layer);
  return (
    <div
      class="col-12 col-sm-6 col-md-4 ext-card degoog-panel degoog-panel--ext-card degoog-panel--in-modal degoog-vstack degoog-vstack--lg degoog-vstack--fill"
      data-code={item.code}
    >
      <div class="ext-card-main">
        <div class="ext-card-info">
          <div class="ext-card-name-row">
            <CompatIcon item={item} />
            <span class="ext-card-name ext-card-name--lg">{item.name}</span>
          </div>
        </div>
        <div class="ext-card-actions">
          {item.installed ? (
            <span
              class="ext-configured-badge"
              data-tooltip={copy("compat-installed", layer)}
              data-tooltip-below={true}
              data-tooltip-end={true}
            ></span>
          ) : null}
          <CompatUpdateButton item={item} layer={layer} ui={ui} />
        </div>
      </div>
      {rows.length ? (
        <div class="degoog-vstack degoog-vstack--sm degoog-vstack--meta">
          {rows}
        </div>
      ) : null}
      {item.installed ? (
        <Button
          variant="secondary"
          class="degoog-btn--block compat-btn-uninstall"
          data-code={item.code}
        >
          {copy("compat-uninstall", layer)}
        </Button>
      ) : (
        <Button
          variant="primary"
          class="degoog-btn--block compat-btn-install"
          data-code={item.code}
        >
          {copy("compat-install", layer)}
        </Button>
      )}
    </div>
  );
};
