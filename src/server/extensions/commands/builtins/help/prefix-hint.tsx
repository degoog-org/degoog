import { Raw } from "../../../../../shared/ui/core/raw";

export const HelpPrefixHint = ({ html }: { html: string }): JSX.Element => (
  <div class="help-hint">
    <Raw html={html} />
  </div>
);
