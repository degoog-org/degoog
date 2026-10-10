import { RedirectBuilder } from "./redirect-builder";
import type { BuilderView } from "./redirect-state";
import { RedirectRuleRow } from "./redirect-rule-row";
import { RedirectTester } from "./redirect-tester";
import type { CheckedRow, RedirectActions, RedirectEditorState } from "./redirect-types";

const t = window.scopedT("core");

export interface RedirectEditorProps {
  state: RedirectEditorState;
  rows: CheckedRow[];
  view: BuilderView | null;
  actions: RedirectActions;
}

export const RedirectEditor = ({ state, rows, view, actions }: RedirectEditorProps): JSX.Element => {
  if (state.oversized) {
    return <p class="settings-desc">{state.oversized}</p>;
  }
  return (
    <div class="settings-redirects">
      <div key="generator" class="settings-redirect-generator">
        <button
          type="button"
          class="settings-score-add settings-redirect-generator-toggle"
          aria-expanded={state.builder.open ? "true" : "false"}
          onClick={actions.builderToggle}
        >
          {t(`settings-page.server.redirect-gen-${state.builder.open ? "hide" : "show"}`)}
        </button>
        {state.builder.open ? (
          <RedirectBuilder key="builder" builder={state.builder} view={view} actions={actions} />
        ) : null}
      </div>
      <div key="rules" class="settings-redirect-rules">
        <h3 class="settings-subheading">{t("settings-page.server.redirect-rules-label")}</h3>
        <p class="settings-desc">{t("settings-page.server.redirect-rules-desc")}</p>
        {state.legacy > 0 ? (
          <p key="legacy" class="settings-redirect-note">
            {t("settings-page.server.redirect-legacy-note", { count: String(state.legacy) })}
          </p>
        ) : null}
        {state.unreadable.length > 0 ? (
          <div key="unreadable" class="settings-redirect-note settings-redirect-note--warn">
            <span>{t("settings-page.server.redirect-unreadable-note")}</span>
            {state.unreadable.map((line, at) => (
              <code key={String(at)} class="settings-redirect-preview-url">
                {line}
              </code>
            ))}
          </div>
        ) : null}
        <div key="rows" class="settings-redirect-rows">
          {rows.map((entry, at) => (
            <RedirectRuleRow key={entry.row.id} entry={entry} position={at + 1} actions={actions} />
          ))}
        </div>
        {rows.length === 0 ? (
          <p key="empty" class="settings-desc">
            {t("settings-page.server.redirect-empty")}
          </p>
        ) : null}
        <button key="add" type="button" class="settings-score-add" onClick={actions.addEmpty}>
          {t("settings-page.server.redirect-add-empty")}
        </button>
        {rows.some(({ check }) => check !== null && !check.ok) ? (
          <p key="blocked" class="settings-redirect-problem" role="status">
            {t("settings-page.server.redirect-fix-before-save")}
          </p>
        ) : null}
      </div>
      <RedirectTester key="tester" rows={rows} testUrl={state.testUrl} actions={actions} />
    </div>
  );
};
