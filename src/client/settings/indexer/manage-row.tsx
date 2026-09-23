import { tr } from "./i18n";
import type { IndexerHitRow } from "../../../shared/indexer";

export const ManageRow = ({ row }: { row: IndexerHitRow }): JSX.Element => (
  <tr>
    <td>
      <label class="degoog-checkbox-wrap">
        <input
          type="checkbox"
          class="indexer-manage-check settings-toggle"
          value={String(row.id)}
          data-type={row.engine_type}
          aria-label={tr("manage-select-row-aria")}
        />
        <span class="degoog-checkbox">
          <i class="fa-solid fa-check"></i>
        </span>
      </label>
    </td>
    <td>{row.query_norm}</td>
    <td>{row.engine_type}</td>
    <td>
      <a href={row.url} target="_blank" rel="noopener noreferrer">
        {row.title || row.url}
      </a>
    </td>
    <td class="degoog-manage-score">
      {Number.isFinite(row.score) ? row.score.toFixed(2) : "-"}
    </td>
    <td>
      <button
        type="button"
        class="degoog-icon-btn indexer-manage-del"
        data-id={String(row.id)}
        data-type={row.engine_type}
        aria-label={tr("manage-delete")}
      >
        <i class="fa-solid fa-trash"></i>
      </button>
    </td>
  </tr>
);
