import { ServerSection } from "../../server/render/server-section";
import { SettingGroup } from "../../shared/rows/setting-group";
import { SettingStackRow } from "../../shared/rows/setting-stack-row";
import { SettingSwitchRow } from "../../shared/rows/setting-switch-row";
import { IndexerNumRow } from "./indexer-num-row";
import { StatsBlock } from "./stats-block";
import { tr } from "../i18n";

const KEY = "settings-page.indexer";
const TEXT_FILTERS = ["domain-allowlist", "domain-blocklist", "word-blocklist"] as const;

const t = window.scopedT("core");

export const IndexerShell = (): JSX.Element => (
  <>
    <p id="indexer-disabled-note" class="settings-desc" hidden={true}>
      {tr("disabled")}
    </p>
    <ServerSection
      id="indexer-stats-wrap"
      heading={`${KEY}.stats-heading`}
      icon="fa-solid fa-chart-simple"
      desc={`${KEY}.desc`}
      open={true}
      hidden={true}
    >
      <StatsBlock />
    </ServerSection>
    <ServerSection
      id="indexer-filters-wrap"
      heading={`${KEY}.filters-heading`}
      icon="fa-solid fa-filter"
      desc={`${KEY}.filters-desc`}
      hidden={true}
    >
      <SettingGroup>
        {TEXT_FILTERS.map((key) => (
          <SettingStackRow label={tr(key)} desc={tr(`${key}-desc`)} forId={`indexer-${key}`}>
            <textarea
              id={`indexer-${key}`}
              class="degoog-input settings-textarea settings-textarea--mono"
              rows={4}
              spellcheck="false"
            ></textarea>
          </SettingStackRow>
        ))}
      </SettingGroup>
    </ServerSection>
    <ServerSection
      id="indexer-storage-wrap"
      heading={`${KEY}.storage-heading`}
      icon="fa-solid fa-hard-drive"
      desc={`${KEY}.storage-desc`}
      hidden={true}
    >
      <SettingGroup>
        <IndexerNumRow name="max-per-search" min={0} max={500} />
        <IndexerNumRow name="max-urls" min={0} />
        <IndexerNumRow name="max-hits" min={0} />
        <IndexerNumRow name="max-age-days" min={0} max={3650} unit={t("settings-page.server.unit-days")} />
        <SettingSwitchRow id="indexer-prune-enabled" label={tr("prune-enabled")} desc={tr("prune-enabled-desc")} />
      </SettingGroup>
      <SettingGroup>
        <IndexerNumRow name="query-limit" min={1} max={500} />
        <SettingSwitchRow id="indexer-fuzzy-enabled" label={tr("fuzzy-enabled")} desc={tr("fuzzy-enabled-desc")} />
        <IndexerNumRow name="ranking-window" min={2} max={10000} unit={tr("ranking-window-unit")} />
      </SettingGroup>
    </ServerSection>
    <ServerSection
      id="indexer-favicon-store-wrap"
      heading={`${KEY}.favicon-store-heading`}
      icon="fa-solid fa-icons"
      desc={`${KEY}.favicon-store-desc`}
      hidden={true}
    >
      <SettingGroup>
        <IndexerNumRow
          name="favicon-store-max-age-days"
          min={1}
          max={3650}
          unit={t("settings-page.server.unit-days")}
        />
      </SettingGroup>
    </ServerSection>
  </>
);
