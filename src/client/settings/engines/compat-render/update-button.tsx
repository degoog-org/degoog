import { copy } from "./copy";
import type { CompatCatalogItem } from "../../../../shared/compat-layers";

export const COMPAT_UPDATE_ICON = "fa-solid fa-arrows-rotate";
export const COMPAT_UPDATE_ICON_BUSY = `${COMPAT_UPDATE_ICON} fa-spin`;
export const COMPAT_UPDATE_ICON_DONE = "fa-solid fa-check";

export interface CompatListUi {
  updating: ReadonlySet<string>;
  updated: ReadonlySet<string>;
}

const _updateState = (
  code: string,
  ui?: CompatListUi,
): "idle" | "updating" | "updated" => {
  if (ui?.updating.has(code)) return "updating";
  if (ui?.updated.has(code)) return "updated";
  return "idle";
};

export const CompatUpdateButton = ({
  item,
  layer,
  ui,
}: {
  item: CompatCatalogItem;
  layer: string;
  ui?: CompatListUi;
}): JSX.Element | null => {
  if (!item.installed) return null;
  const state = _updateState(item.code, ui);
  const done = state === "updated";
  const busy = state === "updating";
  const label = copy(
    done ? "compat-updated-icon" : busy ? "compat-updating" : "compat-update",
    layer,
  );
  const icon = done
    ? COMPAT_UPDATE_ICON_DONE
    : busy
      ? COMPAT_UPDATE_ICON_BUSY
      : COMPAT_UPDATE_ICON;
  return (
    <button
      class={
        done
          ? "degoog-icon-btn degoog-icon-btn--padded compat-btn-update compat-btn-update--done"
          : "degoog-icon-btn degoog-icon-btn--padded compat-btn-update"
      }
      type="button"
      data-code={item.code}
      data-tooltip={label}
      data-tooltip-below={true}
      data-tooltip-end={true}
      aria-label={label}
      disabled={busy}
      aria-busy={busy ? "true" : undefined}
    >
      <i class={icon}></i>
    </button>
  );
};
