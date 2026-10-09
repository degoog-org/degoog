import { Desc } from "../../../../shared/ui/components/forms/desc";
import { LabelFor } from "./label-for";
import { tr } from "../i18n";

const TEXT_FILTERS = ["domain-allowlist", "domain-blocklist", "word-blocklist"];

export const FiltersFieldset = (): JSX.Element => (
  <fieldset class="settings-fieldset">
    {TEXT_FILTERS.map((key) => (
      <div class="settings-field">
        <LabelFor id={`indexer-${key}`} k={key} />
        <Desc text={tr(`${key}-desc`)} />
        <textarea
          id={`indexer-${key}`}
          class="settings-proxy-urls degoog-input"
          rows={3}
        ></textarea>
      </div>
    ))}
  </fieldset>
);
