import { buttonClass } from "../../../../shared/ui/components/primitives/button";
import { Icon } from "../../../../shared/ui/components/primitives/icon";
import { runRule, sampleLink } from "../../../../shared/redirects/redirect-builder";
import type { BuilderView } from "./redirect-state";
import type { RedirectActions, RedirectBuilderState } from "./redirect-types";

const t = window.scopedT("core");

export interface RedirectBuilderProps {
  builder: RedirectBuilderState;
  view: BuilderView | null;
  actions: RedirectActions;
}

const _gen = (key: string): string => t(`settings-page.server.redirect-gen-${key}`);

const _bare = (url: string): string => url.replace(/^https:\/\//, "").replace(/\/$/, "");

const _proof = (view: BuilderView): string => {
  const sample = sampleLink(view.example, view.choices);
  const sampled = sample ? runRule(view.rule, sample) : null;
  if (sample && sampled) return `${_bare(sample)} -> ${_bare(sampled)}`;
  const own = runRule(view.rule, view.example.before.toString());
  return own ? `${_bare(view.example.before.toString())} -> ${_bare(own)}` : _gen("no-change");
};

export const RedirectBuilder = ({ builder, view, actions }: RedirectBuilderProps): JSX.Element => {
  const bothFilled = builder.before.trim() !== "" && builder.after.trim() !== "";
  return (
    <div class="settings-redirect-builder">
      <div class="settings-redirect-pair">
        <label class="settings-redirect-pair-label" for="settings-redirect-gen-before">
          {_gen("before-label")}
        </label>
        <input
          id="settings-redirect-gen-before"
          type="url"
          class="degoog-input settings-redirect-input"
          value={builder.before}
          placeholder="https://golf.happygilmore.com/swing/tips"
          spellcheck="false"
          autocomplete="off"
          onInput={actions.builderBefore}
        />
        <label class="settings-redirect-pair-label" for="settings-redirect-gen-after">
          {_gen("after-label")}
        </label>
        <input
          id="settings-redirect-gen-after"
          type="url"
          class="degoog-input settings-redirect-input"
          value={builder.after}
          placeholder="https://billymadison.com/golf/swing/tips"
          spellcheck="false"
          autocomplete="off"
          onInput={actions.builderAfter}
        />
      </div>

      {bothFilled && !view ? (
        <p key="bad" class="settings-redirect-problem">{_gen("bad-link")}</p>
      ) : null}

      {view ? (
        <div key="choices" class="settings-redirect-choices">
          <label class="degoog-checkbox-wrap">
            <input
              type="checkbox"
              class="settings-toggle"
              checked={view.choices.allSubdomains}
              onChange={actions.builderSubdomains}
            />
            <span class="degoog-checkbox">
              <Icon name="fa-solid fa-check" />
            </span>
            <span class="settings-toggle-label">{_gen("all-subdomains")}</span>
          </label>
          <label class="degoog-checkbox-wrap">
            <input
              type="checkbox"
              class="settings-toggle"
              checked={view.choices.keepRest}
              onChange={actions.builderKeepRest}
            />
            <span class="degoog-checkbox">
              <Icon name="fa-solid fa-check" />
            </span>
            <span class="settings-toggle-label">{_gen("keep-rest")}</span>
          </label>
        </div>
      ) : null}

      {view ? (
        <div key="generated" class="settings-redirect-generated">
          <div class="settings-redirect-preview-line">
            <span class="settings-redirect-preview-tag">{_gen("left")}</span>
            <code class="settings-redirect-preview-url">{view.rule.match}</code>
          </div>
          <div class="settings-redirect-preview-line">
            <span class="settings-redirect-preview-tag">{_gen("right")}</span>
            <code class="settings-redirect-preview-url">{view.rule.replace}</code>
          </div>
        </div>
      ) : null}

      {view && view.reproduces ? (
        <div key="proof" class="settings-redirect-proof">
          <span class="settings-redirect-preview-tag">{_gen("also-works")}</span>
          <code class="settings-redirect-preview-url settings-redirect-preview-url--after">{_proof(view)}</code>
        </div>
      ) : null}

      {view && !view.reproduces ? (
        <p key="mismatch" class="settings-redirect-problem" role="alert">
          {_gen("mismatch")}
        </p>
      ) : null}

      {view ? (
        <div key="actions" class="settings-redirect-builder-actions">
          <button
            type="button"
            class={buttonClass("primary")}
            disabled={!view.reproduces}
            onClick={actions.builderAdd}
          >
            {_gen("use")}
          </button>
        </div>
      ) : null}
    </div>
  );
};
