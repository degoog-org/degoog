import { tr } from "./i18n";

export const renderShell = (container: HTMLElement): void => {
  container.innerHTML = `
    <section
      class="settings-section ext-card degoog-panel degoog-panel--ext-card"
      id="indexer-tab-section"
    >
      <div class="setting-section-heading-wrapper">
        <h2 class="settings-section-heading">${tr("heading")}</h2>
        <div class="floating-section-icon">
          <i class="fa-solid fa-database"></i>
        </div>
      </div>
      <p class="settings-desc">${tr("desc")}</p>

      <p id="indexer-disabled-note" class="settings-desc degoog-indexer-disabled-note" hidden>
        ${tr("disabled")}
      </p>

      <fieldset class="settings-fieldset">
        <fieldset
          id="indexer-filters-wrap"
          class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact"
          hidden
        >
          <p class="settings-rate-limit-defaults">${tr("filters-heading")}</p>
          <label class="settings-proxy-urls-label" for="indexer-domain-allowlist">${tr("domain-allowlist")}</label>
          <textarea id="indexer-domain-allowlist" class="settings-proxy-urls degoog-input" rows="3"></textarea>
          <p class="settings-desc">${tr("domain-allowlist-desc")}</p>
          <label class="settings-proxy-urls-label" for="indexer-domain-blocklist">${tr("domain-blocklist")}</label>
          <textarea id="indexer-domain-blocklist" class="settings-proxy-urls degoog-input" rows="3"></textarea>
          <p class="settings-desc">${tr("domain-blocklist-desc")}</p>
          <label class="settings-proxy-urls-label" for="indexer-word-blocklist">${tr("word-blocklist")}</label>
          <textarea id="indexer-word-blocklist" class="settings-proxy-urls degoog-input" rows="3"></textarea>
          <p class="settings-desc">${tr("word-blocklist-desc")}</p>
        </fieldset>

        <fieldset
          id="indexer-storage-wrap"
          class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact degoog-indexer-stats"
          hidden
        >
          <p class="settings-rate-limit-defaults">${tr("storage-heading")}</p>
          <label class="settings-proxy-urls-label" for="indexer-max-per-search">${tr("max-per-search")}</label>
          <input
            type="number"
            id="indexer-max-per-search"
            class="settings-rate-limit-input degoog-input"
            min="0"
            max="500"
            step="1"
          />
          <p class="settings-desc">${tr("max-per-search-desc")}</p>
          <label class="settings-proxy-urls-label" for="indexer-max-urls">${tr("max-urls")}</label>
          <input
            type="number"
            id="indexer-max-urls"
            class="settings-rate-limit-input degoog-input"
            min="0"
            step="1"
          />
          <p class="settings-desc">${tr("max-urls-desc")}</p>
          <label class="settings-proxy-urls-label" for="indexer-max-hits">${tr("max-hits")}</label>
          <input
            type="number"
            id="indexer-max-hits"
            class="settings-rate-limit-input degoog-input"
            min="0"
            step="1"
          />
          <p class="settings-desc">${tr("max-hits-desc")}</p>
          <label class="settings-proxy-urls-label" for="indexer-max-age-days">${tr("max-age-days")}</label>
          <input
            type="number"
            id="indexer-max-age-days"
            class="settings-rate-limit-input degoog-input"
            min="0"
            max="3650"
            step="1"
          />
          <p class="settings-desc">${tr("max-age-days-desc")}</p>
          <label class="settings-toggle-wrap degoog-toggle-wrap">
            <input type="checkbox" id="indexer-prune-enabled" class="settings-toggle" />
            <span class="toggle-slider degoog-toggle"></span>
            <span class="settings-toggle-label">${tr("prune-enabled")}</span>
          </label>
          <p class="settings-desc">${tr("prune-enabled-desc")}</p>
          <label class="settings-toggle-wrap degoog-toggle-wrap">
            <input type="checkbox" id="indexer-fuzzy-enabled" class="settings-toggle" />
            <span class="toggle-slider degoog-toggle"></span>
            <span class="settings-toggle-label">${tr("fuzzy-enabled")}</span>
          </label>
          <p class="settings-desc">${tr("fuzzy-enabled-desc")}</p>
          <label class="settings-proxy-urls-label" for="indexer-query-limit">${tr("query-limit")}</label>
          <input
            type="number"
            id="indexer-query-limit"
            class="settings-rate-limit-input degoog-input"
            min="1"
            max="500"
            step="1"
          />
          <p class="settings-desc">${tr("query-limit-desc")}</p>
          <label class="settings-proxy-urls-label" for="indexer-ranking-window">${tr("ranking-window")}</label>
          <input
            type="number"
            id="indexer-ranking-window"
            class="settings-rate-limit-input degoog-input"
            min="2"
            max="10000"
            step="1"
          />
          <p class="settings-desc">${tr("ranking-window-desc")}</p>
        </fieldset>

        <div id="indexer-stats-wrap" class="degoog-indexer-stats" hidden>
          <p class="settings-rate-limit-defaults">${tr("stats-heading")}</p>
          <dl class="degoog-stat-grid">
            <div><dt>${tr("total-hits")}</dt><dd id="indexer-stat-hits">0</dd></div>
            <div><dt>${tr("total-urls")}</dt><dd id="indexer-stat-urls">0</dd></div>
            <div><dt>${tr("total-queries")}</dt><dd id="indexer-stat-queries">0</dd></div>
            <div><dt>${tr("db-size")}</dt><dd id="indexer-stat-size">0 B</dd></div>
          </dl>
          <div id="indexer-by-type" class="degoog-stat-grid degoog-stat-grid--types"></div>

          <div class="degoog-action-row degoog-action-row--buttons">
            <button
              type="button"
              class="btn btn--secondary degoog-btn degoog-btn--secondary"
              id="indexer-manage-btn"
            >
              ${tr("manage-btn")}
            </button>
            <button
              type="button"
              class="btn btn--secondary degoog-btn degoog-btn--secondary"
              id="indexer-export-btn"
            >
              ${tr("export-btn")}
            </button>
            <button
              type="button"
              class="btn btn--secondary degoog-btn degoog-btn--secondary"
              id="indexer-import-btn"
              hidden
            >
              ${tr("import-btn")}
            </button>
            <button
              type="button"
              class="btn btn--secondary degoog-btn degoog-btn--secondary"
              id="indexer-clear-btn"
            >
              ${tr("clear-btn")}
            </button>
          </div>
          <p id="indexer-action-status" class="settings-desc"></p>
        </div>
      </fieldset>
    </section>
  `;
};
