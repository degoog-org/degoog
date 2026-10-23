import { RawDogIt } from "../../../../../shared/ui/tribute/rawdogit";
import { TransText } from "../../../../../shared/ui/components/primitives/trans-text";
import type { Child } from "../../../../../shared/ui/tribute/types";
import { linkHref } from "../../../../../shared/utils/url";
import { renderMdInline } from "../../../../utils/dom/md";
import { CardActions } from "./card-actions";
import { CardNotes } from "./card-notes";
import { CardState } from "./card-state";
import { CardThumb } from "./card-thumb";
import { itemSubLabel } from "../labels";
import { st } from "../../format";
import type { StoreActions, StoreItem, StoreState } from "../../../../types/store-tab";

const _author = (item: StoreItem): JSX.Element | null => {
  const author = item.author;
  if (!author?.name) return null;
  const href = linkHref(author.url);
  return (
    <TransText
      text={st("by-author", { author: "{author}" })}
      slots={{
        author: href ? (
          <a class="store-card-author" href={href} target="_blank" rel="noopener noreferrer">
            {author.name}
          </a>
        ) : (
          author.name
        ),
      }}
    />
  );
};

const _meta = (item: StoreItem): Child[] => {
  if (item.untracked) return [st("not-in-repo")];
  if (item.orphaned) return [item.repoName];
  const parts: Child[] = [
    item.type === "theme" ? "" : itemSubLabel(item),
    _author(item),
    item.repoName,
  ].filter(Boolean);
  return parts.flatMap((part, i) => (i === 0 ? [part] : [" · ", part]));
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
