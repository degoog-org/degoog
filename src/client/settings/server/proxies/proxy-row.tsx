import type { ProxyRow as ProxyRowState, ProxyRowActions } from "../../../types/settings-proxy";

const t = window.scopedT("core");

export interface ProxyRowProps {
  row: ProxyRowState;
  position: number;
  actions: ProxyRowActions;
}

const _statusText = (row: ProxyRowState): string => {
  if (row.status === "ok" || row.status === "leak") {
    return t(`settings-page.server.proxy-status-${row.status}`, {
      ip: row.ip ?? "",
      ms: String(row.ms ?? 0),
    });
  }
  return t(`settings-page.server.proxy-status-${row.status}`);
};

export const ProxyRow = ({ row, position, actions }: ProxyRowProps): JSX.Element => {
  const status = _statusText(row);
  return (
    <div class="settings-proxy-row" data-row-id={row.id}>
      <span
        class={`settings-proxy-dot settings-proxy-dot--${row.status}`}
        data-tooltip={status}
        data-tooltip-start={true}
        role="img"
        aria-label={status}
      ></span>
      <input
        type="text"
        class="degoog-input settings-proxy-input"
        data-row-id={row.id}
        value={row.url}
        placeholder="http://user:pass@proxy:8080"
        aria-label={t("settings-page.server.proxy-url-aria", { n: String(position) })}
        spellcheck="false"
        autocomplete="off"
        onInput={actions.rowInput}
        onChange={actions.rowCommit}
      />
      <button
        type="button"
        class="settings-score-remove degoog-icon-btn"
        data-row-id={row.id}
        aria-label={t("settings-page.server.proxy-remove-aria")}
        onClick={actions.rowRemove}
      >
        ×
      </button>
    </div>
  );
};
