import { RedirectProblem } from "../../../../shared/redirects/redirect-match";
import type { RedirectCheck } from "../../../../shared/redirects/redirect-rules";

const t = window.scopedT("core");

export const redirectProblemText = (check: RedirectCheck | null): string | null => {
  if (!check || check.ok) return null;
  if (check.problem === RedirectProblem.InvalidRegex) {
    return t("settings-page.server.redirect-problem-invalid-regex", { detail: check.detail ?? "" });
  }
  return t(`settings-page.server.redirect-problem-${check.problem}`);
};
