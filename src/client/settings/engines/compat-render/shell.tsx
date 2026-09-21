import { escapeHtml } from "../../../../shared/ui/core/escape";
import { Raw } from "../../../../shared/ui/core/raw";
import { copy } from "./copy";
import {
  CompatLayerId,
  COMPAT_LAYER_LABELS,
  COMPAT_LAYER_REPOS,
} from "../../../../shared/compat-layers";

const _introHtml = (id: CompatLayerId, layer: string): string => {
  const link = `<a class="degoog-link" href="${COMPAT_LAYER_REPOS[id]}" target="_blank" rel="noopener noreferrer">${escapeHtml(copy(`compat-intro-link-${id}`, layer))}</a>`;
  const body = escapeHtml(copy(`compat-intro-${id}`, layer));
  return body.includes("{link}") ? body.replace("{link}", link) : `${body} ${link}`;
};

export const CompatShell = ({ id }: { id: CompatLayerId }): JSX.Element => {
  const layer = COMPAT_LAYER_LABELS[id];
  return (
    <>
      <p class="compat-note-intro">
        <Raw html={_introHtml(id, layer)} />
      </p>
      <input
        type="text"
        class="store-search-input degoog-search-bar degoog-search-bar--square-advanced"
        id="compat-search-input"
        placeholder={copy("compat-search", layer)}
        autocomplete="off"
      />
      <div class="ext-modal-status compat-status" id="compat-status" role="status"></div>
      <div id="compat-list"></div>
    </>
  );
};
