import { CompatCard } from "./card";
import { compatGroups } from "./grouping";
import { copy } from "./copy";
import type { CompatListUi } from "./update-button";
import type { CompatCatalogItem } from "../../../../../shared/compat-layers";

export const CompatList = ({
  items,
  layer,
  ui,
}: {
  items: CompatCatalogItem[];
  layer: string;
  ui?: CompatListUi;
}): JSX.Element => {
  if (!items.length) {
    return <p class="ext-field-desc">{copy("compat-empty", layer)}</p>;
  }
  return (
    <>
      {compatGroups(items).map((group) => (
        <section key={group.key} class="ext-group">
          <h3 class="ext-group-label">{group.label}</h3>
          <div class="degoog-grid">
            {group.items.map((item) => (
              <CompatCard key={item.code} item={item} layer={layer} ui={ui} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
};
