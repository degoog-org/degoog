import { bindingParts } from "../../../shortcuts/binding";
import type { StoreItem } from "../../../types/store-tab";

export const ShortcutKeycaps = ({ item }: { item: StoreItem }): JSX.Element | null => {
  if (!item.shortcutBinding) return null;
  const caps = bindingParts(item.shortcutBinding, item.shortcutKind ?? "single");
  if (!caps.length) return null;
  return (
    <div class="store-card-thumb store-card-keycaps">
      {caps.map((cap, index) => (
        <>
          {index > 0 ? <span class="store-keycap-plus">+</span> : null}
          <kbd class="store-keycap">{cap}</kbd>
        </>
      ))}
    </div>
  );
};
