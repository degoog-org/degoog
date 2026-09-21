import { renderHtml } from "../../../shared/ui/core/html";
import { Button } from "../../../shared/ui/components/primitives/button";
import { Desc } from "../../../shared/ui/components/forms/desc";
import { Toggle } from "../../../shared/ui/components/forms/toggle";
import { Icon } from "../../../shared/ui/components/primitives/icon";
import { tr } from "./i18n";

const FIELDSET_INNER =
  "settings-fieldset settings-fieldset-inverse settings-fieldset--compact";
const LABEL = "settings-proxy-urls-label";
const NUMBER = "settings-rate-limit-input degoog-input";

const TEXT_FILTERS = ["domain-allowlist", "domain-blocklist", "word-blocklist"];

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

const STATS = [
  { key: "total-hits", id: "indexer-stat-hits", initial: "0" },
  { key: "total-urls", id: "indexer-stat-urls", initial: "0" },
  { key: "total-queries", id: "indexer-stat-queries", initial: "0" },
  { key: "db-size", id: "indexer-stat-size", initial: "0 B" },
];

const ACTIONS = ["manage", "export", "import", "clear"];

const LabelFor = ({ id, k }: { id: string; k: string }): JSX.Element => (
  <label class={LABEL} for={id}>
    {tr(k)}
  </label>
);

const NumberField = ({
  name: fieldKey,
  min,
  max,
}: {
  name: string;
  min: number;
  max?: number;
}): JSX.Element => (
  <>
    <LabelFor id={`indexer-${fieldKey}`} k={fieldKey} />
    <input
      type="number"
      id={`indexer-${fieldKey}`}
      class={NUMBER}
      min={min}
      max={max}
      step={1}
    />
    <Desc text={tr(`${fieldKey}-desc`)} />
  </>
);

const FiltersFieldset = (): JSX.Element => (
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

const StorageFieldset = (): JSX.Element => (
  <fieldset
    id="indexer-storage-wrap"
    class={`${FIELDSET_INNER} degoog-indexer-stats`}
    hidden={true}
  >
    <p class="settings-rate-limit-defaults">{tr("storage-heading")}</p>
    {NUMBER_FIELDS.map((field) => (
      <NumberField name={field.key} min={field.min} max={field.max} />
    ))}
    {TOGGLES.map((key) => (
      <>
        <Toggle id={`indexer-${key}`} label={tr(key)} />
        <Desc text={tr(`${key}-desc`)} />
      </>
    ))}
    {TAIL_NUMBER_FIELDS.map((field) => (
      <NumberField name={field.key} min={field.min} max={field.max} />
    ))}
  </fieldset>
);

const StatsBlock = (): JSX.Element => (
  <div id="indexer-stats-wrap" class="degoog-indexer-stats" hidden={true}>
    <p class="settings-rate-limit-defaults">{tr("stats-heading")}</p>
    <dl class="degoog-stat-grid">
      {STATS.map((stat) => (
        <div>
          <dt>{tr(stat.key)}</dt>
          <dd id={stat.id}>{stat.initial}</dd>
        </div>
      ))}
    </dl>
    <div id="indexer-by-type" class="degoog-stat-grid degoog-stat-grid--types"></div>

    <div class="degoog-action-row degoog-action-row--buttons">
      {ACTIONS.map((action) => (
        <Button variant="secondary" id={`indexer-${action}-btn`}>
          {tr(`${action}-btn`)}
        </Button>
      ))}
    </div>
    <p id="indexer-action-status" class="settings-desc"></p>
  </div>
);

export const renderShell = (container: HTMLElement): void => {
  container.innerHTML = renderHtml(
    <section
      class="settings-section ext-card degoog-panel degoog-panel--ext-card"
      id="indexer-tab-section"
    >
      <div class="setting-section-heading-wrapper">
        <h2 class="settings-section-heading">{tr("heading")}</h2>
        <div class="floating-section-icon">
          <Icon name="fa-solid fa-database" />
        </div>
      </div>
      <Desc text={tr("desc")} />

      <p
        id="indexer-disabled-note"
        class="settings-desc degoog-indexer-disabled-note"
        hidden={true}
      >
        {tr("disabled")}
      </p>

      <fieldset class="settings-fieldset">
        <FiltersFieldset />
        <StorageFieldset />
        <StatsBlock />
      </fieldset>
    </section>,
  );
};
