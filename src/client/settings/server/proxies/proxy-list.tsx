import type { ProxyRow as ProxyRowState, ProxyRowActions } from "../../../types/settings-proxy";
import { ProxyRow } from "./proxy-row";

const t = window.scopedT("core");

export interface ProxyListProps {
  rows: ProxyRowState[];
  limit: number;
  actions: ProxyRowActions;
}

export const ProxyList = ({ rows, limit, actions }: ProxyListProps): JSX.Element => {
  const bulk = t("settings-page.server.proxy-bulk-add");
  return (
    <>
      <div class="settings-proxy-rows">
        {rows.slice(0, limit).map((row, i) => (
          <ProxyRow key={row.id} row={row} position={i + 1} actions={actions} />
        ))}
      </div>
      {rows.length > limit ? (
        <button type="button" class="settings-show-all" onClick={actions.showAll}>
          {t("settings-page.server.show-all", { count: String(rows.length) })}
        </button>
      ) : null}
      <div class="settings-proxy-actions">
        <button type="button" class="settings-score-add" onClick={actions.addRow}>
          {t("settings-page.server.proxy-add-row")}
        </button>
        <button
          type="button"
          class="degoog-icon-btn settings-proxy-bulk"
          data-tooltip={bulk}
          aria-label={bulk}
          onClick={actions.openBulk}
        >
          <i class="fa-regular fa-file-lines" aria-hidden="true"></i>
        </button>
      </div>
    </>
  );
};
