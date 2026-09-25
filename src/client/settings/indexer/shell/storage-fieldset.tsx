import { Desc } from "../../../../shared/ui/components/forms/desc";
import { Toggle } from "../../../../shared/ui/components/forms/toggle";
import { IndexerNumberField } from "./indexer-number-field";
import { FIELDSET_INNER } from "../../server/render/classes";
import { tr } from "../i18n";

const NUMBER_FIELDS = [
  { key: "max-per-search", min: 0, max: 500 },
  { key: "max-urls", min: 0, max: undefined },
  { key: "max-hits", min: 0, max: undefined },
  { key: "max-age-days", min: 0, max: 3650 },
] as const;

const TAIL_NUMBER_FIELDS = [
  { key: "query-limit", min: 1, max: 500 },
  { key: "ranking-window", min: 2, max: 10000 },
] as const;

const TOGGLES = ["prune-enabled", "fuzzy-enabled"];

export const StorageFieldset = (): JSX.Element => (
  <fieldset
    id="indexer-storage-wrap"
    class={`${FIELDSET_INNER} degoog-indexer-stats`}
    hidden={true}
  >
    <p class="settings-rate-limit-defaults">{tr("storage-heading")}</p>
    {NUMBER_FIELDS.map((field) => (
      <IndexerNumberField name={field.key} min={field.min} max={field.max} />
    ))}
    {TOGGLES.map((key) => (
      <>
        <Toggle id={`indexer-${key}`} label={tr(key)} />
        <Desc text={tr(`${key}-desc`)} />
      </>
    ))}
    {TAIL_NUMBER_FIELDS.map((field) => (
      <IndexerNumberField name={field.key} min={field.min} max={field.max} />
    ))}
  </fieldset>
);
