import { Button } from "../../../../shared/ui/components/primitives/button";
import { SettingGroup } from "../../shared/rows/setting-group";
import { SettingStackRow } from "../../shared/rows/setting-stack-row";
import { tr } from "../i18n";

const STATS = [
  { key: "total-hits", id: "indexer-stat-hits", initial: "0" },
  { key: "total-urls", id: "indexer-stat-urls", initial: "0" },
  { key: "total-queries", id: "indexer-stat-queries", initial: "0" },
  { key: "db-size", id: "indexer-stat-size", initial: "0 B" },
];

const ACTIONS = ["manage", "export", "import"] as const;

export const StatsBlock = (): JSX.Element => (
  <>
    <SettingGroup>
      <dl class="settings-stats">
        {STATS.map((stat) => (
          <div>
            <dt>{tr(stat.key)}</dt>
            <dd id={stat.id}>{stat.initial}</dd>
          </div>
        ))}
      </dl>
    </SettingGroup>
    <SettingGroup>
      <SettingStackRow label={tr("by-type")}>
        <dl id="indexer-by-type" class="settings-type-counts"></dl>
      </SettingStackRow>
    </SettingGroup>
    <SettingGroup>
      <div class="settings-actions-row">
        {ACTIONS.map((action) => (
          <Button variant="secondary" id={`indexer-${action}-btn`}>
            {tr(`${action}-btn`)}
          </Button>
        ))}
        <Button variant="danger" id="indexer-clear-btn">
          {tr("clear-btn")}
        </Button>
      </div>
      <p id="indexer-action-status" class="settings-row-desc"></p>
    </SettingGroup>
  </>
);
