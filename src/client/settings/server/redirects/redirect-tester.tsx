import { applyRedirect } from "../../../../shared/redirects/redirect-rules";
import { RedirectPreview } from "./redirect-preview";
import type { CheckedRow, RedirectActions } from "./redirect-types";

const t = window.scopedT("core");

export interface RedirectTesterProps {
  rows: CheckedRow[];
  testUrl: string;
  actions: RedirectActions;
}

interface TestOutcome {
  after: string | null;
  miss: string;
  label?: string;
}

const _isLink = (value: string): boolean => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const _outcome = (rows: CheckedRow[], url: string): TestOutcome => {
  if (!_isLink(url)) return { after: null, miss: t("settings-page.server.redirect-test-invalid") };
  const valid = rows.flatMap(({ check }, at) =>
    check?.ok ? [{ compiled: check.compiled, position: at + 1 }] : [],
  );
  const hit = applyRedirect(url, valid.map((entry) => entry.compiled));
  if (!hit) return { after: null, miss: t("settings-page.server.redirect-test-miss") };
  return {
    after: hit.url,
    miss: "",
    label: t("settings-page.server.redirect-test-hit", { n: String(valid[hit.index].position) }),
  };
};

export const RedirectTester = ({ rows, testUrl, actions }: RedirectTesterProps): JSX.Element => {
  const url = testUrl.trim();
  const outcome = url ? _outcome(rows, url) : null;
  return (
    <div class="settings-redirect-tester">
      <label class="settings-proxy-urls-label" for="settings-redirect-test-url">
        {t("settings-page.server.redirect-test-label")}
      </label>
      <input
        type="url"
        id="settings-redirect-test-url"
        class="degoog-input settings-redirect-input"
        value={testUrl}
        placeholder="https://golf.happygilmore.com/swing/tips"
        spellcheck="false"
        autocomplete="off"
        onInput={actions.testInput}
      />
      {outcome ? (
        <RedirectPreview before={url} after={outcome.after} missText={outcome.miss} label={outcome.label} />
      ) : null}
    </div>
  );
};
