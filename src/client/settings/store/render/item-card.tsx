import { Raw } from "../../../../shared/ui/core/raw";
import { Badge } from "../../../../shared/ui/components/primitives/badge";
import { ItemCardActions } from "./item-card-actions";
import { ItemCardAuthor } from "./item-card-author";
import { ShortcutKeycaps } from "./shortcut-keycaps";
import { engineTypeLabel, pluginTypeLabel } from "./labels";
import { screenshotUrl } from "../lightbox";
import { renderMdInline } from "../../../utils/md";
import type { Props } from "../../../../shared/ui/core/types";
import type { StoreItem } from "../../../types/store-tab";

const t = window.scopedT("core");

const _typeLabel = (item: StoreItem): string => {
  if (item.type === "plugin") return "Plugin";
  if (item.type === "engine") return "Engine";
  if (item.type === "transport") return "Transport";
  if (item.type === "autocomplete") return "Autocomplete";
  if (item.type === "shortcut") return "Shortcut";
  return "Theme";
};

const _subLabel = (item: StoreItem): string => {
  if (item.type === "plugin") return item.pluginType ? pluginTypeLabel(item.pluginType) : "";
  if (item.type === "engine") return item.engineType ? engineTypeLabel(item.engineType) : "";
  return "";
};

export const ItemCard = ({ item }: { item: StoreItem }): JSX.Element => {
  const itemSlug = item.path.split("/").pop() ?? "";
  const hasScreenshots = item.screenshots.length > 0;
  const firstUrl = hasScreenshots
    ? screenshotUrl(item.repoSlug, item.type, itemSlug, item.screenshots[0])
    : "";
  const keycaps = item.type === "shortcut" ? ShortcutKeycaps({ item }) : null;
  const thumbProps: Props = hasScreenshots
    ? {
        "data-screenshot-files": item.screenshots.join(","),
        "data-repo-slug": item.repoSlug,
        "data-item-type": item.type,
        "data-item-slug": itemSlug,
        "data-first-screenshot-url": firstUrl,
        role: "button",
        tabindex: "0",
        "aria-label": "View screenshots",
      }
    : {};
  const subLabel = _subLabel(item);

  return (
    <div
      class="store-card"
      data-repo-url={item.repoUrl}
      data-item-path={item.path}
      data-type={item.type}
      data-plugin-type={item.pluginType || ""}
      data-engine-type={item.engineType || ""}
    >
      <div
        class={
          hasScreenshots
            ? "store-card-thumb-wrap store-card-thumb-wrap--clickable"
            : "store-card-thumb-wrap"
        }
        {...thumbProps}
      >
        {hasScreenshots ? (
          <img src={firstUrl} alt="" class="store-card-thumb" loading="lazy" />
        ) : (
          (keycaps ?? <div class="store-card-thumb store-card-thumb-placeholder"></div>)
        )}
      </div>
      <div class="store-card-body">
        <div class="store-card-main">
          <div class="store-card-name">{item.name}</div>
          <div class="store-card-meta">
            {"by "}
            <ItemCardAuthor item={item} />
            {" · "}
            {item.repoName}
          </div>
          <div class="store-card-desc">
            <Raw html={renderMdInline(item.description || "")} />
          </div>
          {item.requiresNewerVersion ? (
            <div class="store-card-version-warning">
              {t("settings-page.extensions.requires-newer-version")}
            </div>
          ) : null}
        </div>
        <div class="store-card-footer">
          <div class="store-card-footer-main">
            <div class="store-card-version">
              {item.updateAvailable ? (
                <>
                  <span class="store-card-version-old">
                    {`v${item.installedVersion || "?"}`}
                  </span>
                  {" \u2192 "}
                </>
              ) : null}
              {`v${item.version}`}
            </div>
            <div class="store-card-footer-meta">
              <Badge modifier="store-type" class={`store-type-badge store-type-${item.type}`}>
                {_typeLabel(item)}
              </Badge>
              {subLabel ? <Badge class="store-subtype-badge">{subLabel}</Badge> : null}
            </div>
          </div>
          <div class="store-card-actions">
            <ItemCardActions item={item} />
          </div>
        </div>
      </div>
    </div>
  );
};
