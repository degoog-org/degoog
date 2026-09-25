import { Button } from "../../../../shared/ui/components/primitives/button";
import { tr } from "../i18n";

const STATS = [
  { key: "total-hits", id: "indexer-stat-hits", initial: "0" },
  { key: "total-urls", id: "indexer-stat-urls", initial: "0" },
  { key: "total-queries", id: "indexer-stat-queries", initial: "0" },
  { key: "db-size", id: "indexer-stat-size", initial: "0 B" },
];

const ACTIONS = ["manage", "export", "import", "clear"];

export const StatsBlock = (): JSX.Element => (
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
