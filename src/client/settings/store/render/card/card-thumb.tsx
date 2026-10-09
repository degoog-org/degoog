import { FaIcon } from "../fa-icon";
import { KIND_ICONS } from "../labels";
import { retryImageOnce } from "../repo-avatar";
import { ShortcutKeycaps } from "./shortcut-keycaps";
import { screenshotUrls } from "../../screenshots";
import { counted, st } from "../../format";
import type { StoreActions, StoreItem } from "../../../../types/store-tab";

export const CardThumb = ({
  item,
  actions,
}: {
  item: StoreItem;
  actions: StoreActions;
}): JSX.Element => {
  const shots = item.screenshots.length;
  if (shots) {
    return (
      <button
        type="button"
        class="store-thumb"
        aria-label={
          shots > 1
            ? counted("view-shots", shots, { name: item.name })
            : st("view-shot", { name: item.name })
        }
        onClick={() => actions.openLightbox(item)}
      >
        <img
          key={screenshotUrls(item)[0]}
          src={screenshotUrls(item)[0]}
          alt=""
          loading="lazy"
          onError={retryImageOnce}
        />
        {shots > 1 ? <span class="store-thumb-count">{String(shots)}</span> : null}
      </button>
    );
  }
  const keys = item.type === "shortcut" ? ShortcutKeycaps({ item }) : null;
  return (
    <div class="store-thumb" aria-hidden="true">
      {keys ?? <FaIcon name={KIND_ICONS[item.type]} />}
    </div>
  );
};
