import { Desc } from "../../../../shared/ui/components/forms/desc";
import { LabelFor } from "./label-for";
import { FIELDSET_INNER } from "./shell-consts";
import { tr } from "../i18n";

const TEXT_FILTERS = ["domain-allowlist", "domain-blocklist", "word-blocklist"];

export const FiltersFieldset = (): JSX.Element => (
  <fieldset id="indexer-filters-wrap" class={FIELDSET_INNER} hidden={true}>
    <p class="settings-rate-limit-defaults">{tr("filters-heading")}</p>
    {TEXT_FILTERS.map((key) => (
      <>
        <LabelFor id={`indexer-${key}`} k={key} />
        <textarea
          id={`indexer-${key}`}
          class="settings-proxy-urls degoog-input"
          rows={3}
        ></textarea>
        <Desc text={tr(`${key}-desc`)} />
      </>
    ))}
  </fieldset>
);
