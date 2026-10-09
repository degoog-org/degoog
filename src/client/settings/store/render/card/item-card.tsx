import { RawDogIt } from "../../../../../shared/ui/tribute/rawdogit";
import { renderMdInline } from "../../../../utils/dom/md";
import { CardActions } from "./card-actions";
import { CardNotes } from "./card-notes";
import { CardState } from "./card-state";
import { CardThumb } from "./card-thumb";
import { itemSubLabel } from "../labels";
import { st } from "../../format";
import type { StoreActions, StoreItem, StoreState } from "../../../../types/store-tab";

const _meta = (item: StoreItem): string => {
  if (item.untracked) return st("not-in-repo");
  if (item.orphaned) return item.repoName;
  return [
    item.type === "theme" ? "" : itemSubLabel(item),
    item.author?.name ? st("by-author", { author: item.author.name }) : "",
    item.repoName,
  ]
    .filter(Boolean)
    .join(" · ");
};

export const ItemCard = ({
  item,
  state,
  actions,
}: {
  item: StoreItem;
  state: StoreState;
  actions: StoreActions;
}): JSX.Element => (
  <article class="store-card">
    <CardThumb item={item} actions={actions} />
    <div class="store-card-text">
      <h4 class="store-card-name">{item.name}</h4>
      <p class="store-card-meta">{_meta(item)}</p>
      {item.description ? (
        <p class="store-card-desc" title={item.description}>
          <RawDogIt html={renderMdInline(item.description)} />
        </p>
      ) : null}
      <CardNotes item={item} state={state} />
    </div>
    <div class="store-card-foot">
      <CardState item={item} state={state} />
      <span class="store-actions">
        <CardActions item={item} state={state} actions={actions} />
      </span>
    </div>
  </article>
);
