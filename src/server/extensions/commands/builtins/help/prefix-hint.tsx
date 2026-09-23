import { RawDogIt } from "../../../../../shared/ui/tribute/rawdogit";

export const HelpPrefixHint = ({ html }: { html: string }): JSX.Element => (
  <div class="help-hint">
    <RawDogIt html={html} />
  </div>
);
