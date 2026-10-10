import { Badge } from "../../../../shared/ui/components/primitives/badge";
import { matchKindOf } from "../../../../shared/redirects/redirect-match";
import { redirectProblemText } from "./redirect-problems";
import type { CheckedRow, RedirectActions } from "./redirect-types";

const t = window.scopedT("core");

export interface RedirectRuleRowProps {
  entry: CheckedRow;
  position: number;
  actions: RedirectActions;
}

export const RedirectRuleRow = ({ entry, position, actions }: RedirectRuleRowProps): JSX.Element => {
  const { row, check } = entry;
  const problem = redirectProblemText(check);
  const kind = check?.kind ?? matchKindOf(row.match);
  const reorder = t("settings-page.extensions.drag-to-reorder");
  return (
    <div
      class={`settings-redirect-row${problem ? " settings-redirect-row--invalid" : ""}`}
      data-row-id={row.id}
    >
      <div class="settings-redirect-row-main">
        <span
          class="degoog-drag-handle settings-redirect-drag"
          data-drag-handle={true}
          tabindex="0"
          role="button"
          title={reorder}
          aria-label={reorder}
        >
          <i class="fa-solid fa-grip-vertical"></i>
        </span>
        <span class="settings-redirect-position">{position}</span>
        <div class="settings-redirect-side settings-redirect-side--tagged">
          <input
            type="text"
            class="degoog-input settings-redirect-input"
            data-row-id={row.id}
            data-field="match"
            value={row.match}
            placeholder={t("settings-page.server.redirect-match-placeholder")}
            aria-label={t("settings-page.server.redirect-match-aria", { n: String(position) })}
            aria-invalid={problem ? "true" : "false"}
            spellcheck="false"
            autocomplete="off"
            onInput={actions.rowInput}
          />
          {row.match.trim() ? (
            <Badge
              class="settings-redirect-kind"
              tooltip={t(`settings-page.server.redirect-kind-${kind}-tip`)}
            >
              {t(`settings-page.server.redirect-kind-${kind}`)}
            </Badge>
          ) : null}
        </div>
        <i class="fa-solid fa-arrow-right settings-redirect-arrow" aria-hidden="true"></i>
        <div class="settings-redirect-side">
          <input
            type="text"
            class="degoog-input settings-redirect-input"
            data-row-id={row.id}
            data-field="replace"
            value={row.replace}
            placeholder={t("settings-page.server.redirect-replace-placeholder")}
            aria-label={t("settings-page.server.redirect-replace-aria", { n: String(position) })}
            spellcheck="false"
            autocomplete="off"
            onInput={actions.rowInput}
          />
        </div>
        <button
          type="button"
          class="settings-score-remove degoog-icon-btn"
          data-row-id={row.id}
          aria-label={t("settings-page.server.redirect-remove-aria")}
          onClick={actions.rowRemove}
        >
          ×
        </button>
      </div>
      {problem ? (
        <p class="settings-redirect-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
};
