import { tr } from "../i18n";

export const ManageBody = ({ types }: { types: string[] }): JSX.Element => (
  <>
    <div class="degoog-manage-filters">
      <input
        type="search"
        id="indexer-manage-search"
        class="degoog-input"
        placeholder={tr("manage-search-placeholder")}
      />
      <select id="indexer-manage-type" class="degoog-input">
        <option value="">{tr("manage-type-all")}</option>
        {types.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </div>
    <table class="degoog-manage-table">
      <thead>
        <tr>
          <th>
            <label class="degoog-checkbox-wrap">
              <input
                type="checkbox"
                id="indexer-manage-selectall"
                class="settings-toggle"
                aria-label={tr("manage-select-all-aria")}
              />
              <span class="degoog-checkbox">
                <i class="fa-solid fa-check"></i>
              </span>
            </label>
          </th>
          <th data-col="query">{tr("manage-col-query")}</th>
          <th data-col="type">{tr("manage-col-type")}</th>
          <th data-col="title">{tr("manage-col-title")}</th>
          <th data-col="score">{tr("manage-col-score")}</th>
          <th data-col="actions"></th>
        </tr>
      </thead>
      <tbody id="indexer-manage-tbody"></tbody>
    </table>
    <p id="indexer-manage-empty" class="settings-desc" hidden={true}></p>
    <div class="degoog-action-row degoog-manage-pager">
      <button
        type="button"
        class="btn btn--secondary degoog-btn degoog-btn--secondary"
        id="indexer-manage-prev"
      >
        {tr("manage-prev")}
      </button>
      <span id="indexer-manage-pageinfo" class="settings-desc"></span>
      <button
        type="button"
        class="btn btn--secondary degoog-btn degoog-btn--secondary"
        id="indexer-manage-next"
      >
        {tr("manage-next")}
      </button>
    </div>
  </>
);
