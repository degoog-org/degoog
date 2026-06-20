import { escapeHtml } from "../../utils/dom";
import { SERVER_SETTINGS_PRESETS } from "./presets";

const t = window.scopedT("core");

const _h = (headingKey: string, icon: string): string =>
  `<div class="setting-section-heading-wrapper">
    <h2 class="settings-section-heading">${escapeHtml(t(headingKey))}</h2>
    <div class="floating-section-icon"><i class="${icon}"></i></div>
  </div>`;

const _desc = (key: string): string =>
  `<p class="settings-desc">${escapeHtml(t(key))}</p>`;

const _renderPresetSection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card settings-server-presets" id="settings-section-server-presets">
    ${_h("settings-page.server.presets.heading", "fa-solid fa-sliders")}
    ${_desc("settings-page.server.presets.desc")}
    <div class="settings-fieldset">
      <label for="settings-server-preset-select" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.presets.select-label"))}</label>
      <div class="degoog-select-wrap">
        <select id="settings-server-preset-select" class="settings-server-preset-select degoog-input">
          <option value="">${escapeHtml(t("settings-page.server.presets.select-placeholder"))}</option>
          ${SERVER_SETTINGS_PRESETS.map(
            (preset) =>
              `<option value="${escapeHtml(preset.id)}">${escapeHtml(t(preset.labelKey))}</option>`,
          ).join("")}
        </select>
      </div>
      <div class="settings-server-preset-preview" id="settings-server-preset-preview" hidden>
        <p class="settings-desc" id="settings-server-preset-description"></p>
        <div class="settings-server-preset-block" id="settings-server-preset-warnings" hidden>
          <strong class="settings-server-preset-title">${escapeHtml(t("settings-page.server.presets.warnings-heading"))}</strong>
          <ul class="settings-server-preset-list" id="settings-server-preset-warning-list"></ul>
        </div>
        <div class="settings-server-preset-block">
          <strong class="settings-server-preset-title">${escapeHtml(t("settings-page.server.presets.changes-heading"))}</strong>
          <ul class="settings-server-preset-list" id="settings-server-preset-change-list"></ul>
        </div>
        <div class="settings-server-preset-actions">
          <button class="btn btn--primary degoog-btn degoog-btn--primary" id="settings-server-preset-apply" type="button">
            ${escapeHtml(t("settings-page.server.presets.apply"))}
          </button>
          <span class="settings-server-preset-status" id="settings-server-preset-status" role="status" aria-live="polite"></span>
        </div>
      </div>
    </div>
  </section>`;

const _toggle = (
  id: string,
  labelKey: string,
  opts: { aria?: string; title?: string; checked?: boolean } = {},
): string => {
  const ariaAttr = opts.aria ? ` aria-label="${escapeHtml(t(opts.aria))}"` : "";
  const titleAttr = opts.title ? ` title="${escapeHtml(t(opts.title))}"` : "";
  const checkedAttr = opts.checked ? " checked" : "";
  return `<label class="settings-toggle-wrap degoog-toggle-wrap"${titleAttr}>
    <input type="checkbox" id="${id}" class="settings-toggle"${ariaAttr}${checkedAttr} />
    <span class="toggle-slider degoog-toggle"></span>
    <span class="settings-toggle-label">${escapeHtml(t(labelKey))}</span>
  </label>`;
};

const _renderCacheSection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card">
    ${_h("settings-page.server.cache-heading", "fa-solid fa-memory")}
    ${_desc("settings-page.server.cache-desc")}
    <div class="settings-cache-buttons">
      <button class="btn btn--secondary degoog-btn degoog-btn--secondary settings-cache-clear" id="settings-cache-clear-search" data-cache-scope="search" type="button">
        ${escapeHtml(t("settings-page.server.cache-clear-search"))}
      </button>
      <button class="btn btn--secondary degoog-btn degoog-btn--secondary settings-cache-clear" id="settings-cache-clear-autocomplete" data-cache-scope="autocomplete" type="button">
        ${escapeHtml(t("settings-page.server.cache-clear-autocomplete"))}
      </button>
      <button class="btn btn--secondary degoog-btn degoog-btn--secondary settings-cache-clear" id="settings-cache-clear-extensions" data-cache-scope="extensions" type="button">
        ${escapeHtml(t("settings-page.server.cache-clear-extensions"))}
      </button>
      <button class="btn btn--secondary degoog-btn degoog-btn--secondary settings-cache-clear" id="settings-cache-clear-all" data-cache-scope="all" type="button">
        ${escapeHtml(t("settings-page.server.cache-clear-all"))}
      </button>
    </div>
  </section>`;

const _renderApiKeySection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card" id="settings-section-api-key">
    ${_h("settings-page.server.api-key-heading", "fa-solid fa-key")}
    ${_desc("settings-page.server.api-key-desc")}
    <div class="settings-toggle-wrap settings-desc degoog-toggle-wrap">
      <div id="settings-api-key-controls" class="settings-api-wrapper" style="display:none">
        <code id="settings-api-key-value" class="settings-toggle-label"></code>
        <div>
          <button type="button" id="settings-api-key-reveal" class="btn btn--secondary degoog-btn degoog-btn--secondary" aria-label="${escapeHtml(t("settings-page.server.api-key-reveal"))}"><i class="fa-solid fa-eye fa-lg"></i></button>
          <button type="button" id="settings-api-key-copy" class="btn btn--secondary degoog-btn degoog-btn--secondary" aria-label="${escapeHtml(t("settings-page.server.api-key-copy"))}"><i class="fa-solid fa-copy fa-lg"></i></button>
          <button type="button" id="settings-api-key-regenerate" class="btn btn--secondary degoog-btn degoog-btn--secondary" aria-label="${escapeHtml(t("settings-page.server.api-key-regenerate"))}"><i class="fa-solid fa-rotate-right fa-lg"></i></button>
        </div>
      </div>
      <p id="settings-api-key-locked" class="settings-desc" hidden>
        ${escapeHtml(t("settings-page.server.api-key-no-password"))}
      </p>
    </div>
    <fieldset class="settings-fieldset" id="settings-api-key-toggles" style="display:none">
      ${_toggle("settings-api-key-search-enabled", "settings-page.server.api-key-search-enable", { aria: "settings-page.server.api-key-search-aria", title: "settings-page.server.api-key-search-tooltip" })}
      ${_toggle("settings-api-key-suggest-enabled", "settings-page.server.api-key-suggest-enable", { aria: "settings-page.server.api-key-suggest-aria", title: "settings-page.server.api-key-suggest-tooltip" })}
    </fieldset>
  </section>`;

const _renderIndexerSection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card" id="settings-section-indexer">
    ${_h("settings-page.server.indexer-heading", "fa-solid fa-database")}
    ${_desc("settings-page.server.indexer-desc")}
    <fieldset class="settings-fieldset">
      ${_toggle("settings-degoog-indexer-enabled", "settings-page.server.indexer-enable", { aria: "settings-page.server.indexer-enable-aria" })}
      ${_desc("settings-page.server.indexer-enable-desc")}
    </fieldset>
  </section>`;

const _renderStreamingSection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card" id="settings-section-streaming">
    ${_h("settings-page.server.streaming-heading", "fa-solid fa-arrow-down-1-9")}
    ${_desc("settings-page.server.streaming-desc")}
    <fieldset class="settings-fieldset">
      ${_toggle("settings-streaming-enabled", "settings-page.server.streaming-enable", { aria: "settings-page.server.streaming-enable-aria", title: "settings-page.server.streaming-enable-tooltip" })}
      <div class="settings-streaming-options" id="settings-streaming-options" style="display: none">
        <fieldset class="settings-fieldset settings-fieldset--compact">
          ${_toggle("settings-streaming-auto-retry", "settings-page.server.streaming-auto-retry", { aria: "settings-page.server.streaming-auto-retry-aria" })}
          <div class="settings-streaming-retry-wrap settings-fieldset settings-fieldset-inverse settings-fieldset--compact" id="settings-streaming-retry-wrap" style="display: none">
            <label for="settings-streaming-max-retries" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.streaming-max-retries-label"))}</label>
            <input type="number" id="settings-streaming-max-retries" data-save-key="streamingMaxRetries" class="settings-rate-limit-input degoog-input" min="1" max="5" placeholder="2" />
          </div>
        </fieldset>
      </div>
    </fieldset>
  </section>`;

const _renderLanguagesSection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card">
    ${_h("settings-page.server.languages-heading", "fa-solid fa-language")}
    ${_desc("settings-page.server.languages-desc")}
    <fieldset class="settings-fieldset">
      ${_toggle("settings-languages-enabled", "settings-page.server.languages-toggle", { aria: "settings-page.server.languages-toggle-aria" })}
      <div class="settings-proxy-urls-wrap settings-fieldset settings-fieldset-inverse settings-fieldset--compact" id="settings-languages-wrap" style="display: none">
        <label for="settings-languages" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.languages-codes-label"))}</label>
        <textarea id="settings-languages" data-save-key="languages" class="settings-proxy-urls degoog-input" rows="5" placeholder="en&#10;it&#10;de&#10;fr&#10;es"></textarea>
      </div>
    </fieldset>
  </section>`;

const _renderDomainBlockSection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card" id="settings-section-domain-block">
    ${_h("settings-page.server.domain-block-heading", "fa-solid fa-ban")}
    ${_desc("settings-page.server.domain-block-desc")}
    <fieldset class="settings-fieldset">
      ${_toggle("settings-domain-block-enabled", "settings-page.server.domain-block-enable", { aria: "settings-page.server.domain-block-enable-aria" })}
      <div class="settings-proxy-urls-wrap" id="settings-domain-block-wrap" style="display: none">
        <fieldset class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact">
          <label for="settings-domain-block-list" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.domain-block-list-label"))}</label>
          ${_desc("settings-page.server.domain-block-regex-help")}
          <textarea id="settings-domain-block-list" data-save-key="domainBlockList" class="settings-proxy-urls degoog-input" rows="5" placeholder="quora.com&#10;tiktok.com&#10;/.*\.spam\.net/"></textarea>
          ${_toggle("settings-domain-block-ui-enabled", "settings-page.server.domain-block-ui-enable")}
          ${_desc("settings-page.server.domain-block-ui-desc")}
        </fieldset>
      </div>
    </fieldset>
  </section>`;

const _renderDomainReplaceSection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card" id="settings-section-domain-replace">
    ${_h("settings-page.server.domain-replace-heading", "fa-solid fa-arrow-right-arrow-left")}
    ${_desc("settings-page.server.domain-replace-desc")}
    <fieldset class="settings-fieldset">
      ${_toggle("settings-domain-replace-enabled", "settings-page.server.domain-replace-enable", { aria: "settings-page.server.domain-replace-enable-aria" })}
      <div class="settings-proxy-urls-wrap" id="settings-domain-replace-wrap" style="display: none">
        <fieldset class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact">
          <label for="settings-domain-replace-list" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.domain-replace-list-label"))}</label>
          <textarea id="settings-domain-replace-list" data-save-key="domainReplaceList" class="settings-proxy-urls degoog-input" rows="5" placeholder="reddit.com -> teddit.example.com&#10;twitter.com -> nitter.example.com"></textarea>
          ${_toggle("settings-domain-replace-ui-enabled", "settings-page.server.domain-replace-ui-enable")}
          ${_desc("settings-page.server.domain-replace-ui-desc")}
        </fieldset>
      </div>
    </fieldset>
  </section>`;

const _renderDomainScoreSection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card" id="settings-section-domain-score">
    ${_h("settings-page.server.domain-score-heading", "fa-solid fa-star")}
    ${_desc("settings-page.server.domain-score-desc")}
    <fieldset class="settings-fieldset">
      ${_toggle("settings-domain-score-enabled", "settings-page.server.domain-score-enable")}
      <div class="settings-proxy-urls-wrap" id="settings-domain-score-wrap" style="display: none">
        <fieldset class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact">
          <span class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.domain-score-list-label"))}</span>
          <div id="settings-domain-score-rows" class="settings-score-rows"></div>
          <button type="button" id="settings-domain-score-add" class="settings-score-add">
            ${escapeHtml(t("settings-page.server.domain-score-add-row"))}
          </button>
          ${_toggle("settings-domain-score-ui-enabled", "settings-page.server.domain-score-ui-enable")}
          ${_desc("settings-page.server.domain-score-ui-desc")}
        </fieldset>
      </div>
    </fieldset>
  </section>`;

const _renderProxySection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card" id="settings-section-proxy">
    ${_h("settings-page.server.proxy-heading", "fa-solid fa-network-wired")}
    ${_desc("settings-page.server.proxy-desc")}
    <fieldset class="settings-fieldset">
      ${_toggle("settings-proxy-enabled", "settings-page.server.proxy-enable", { aria: "settings-page.server.proxy-enable-aria" })}
      <div class="settings-proxy-urls-wrap" id="settings-proxy-urls-wrap" style="display: none">
        <fieldset class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact">
          <label for="settings-proxy-urls" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.proxy-urls-label"))}</label>
          <textarea id="settings-proxy-urls" data-save-key="proxyUrls" class="settings-proxy-urls degoog-input" rows="4" placeholder="http://proxy1:8080&#10;http://user:pass@proxy2:8080&#10;socks5://proxy3:1080"></textarea>
          <button class="btn btn--secondary degoog-btn degoog-btn--secondary proxy-test-btn" id="settings-proxy-test" type="button">
            ${escapeHtml(t("settings-page.server.proxy-test"))}
          </button>
          <div class="proxy-test-result" id="settings-proxy-test-result" hidden></div>
        </fieldset>
      </div>
      ${_toggle("settings-image-proxy-allow-local", "settings-page.server.image-proxy-allow-local", { aria: "settings-page.server.image-proxy-allow-local-aria" })}
      <div class="settings-proxy-urls-wrap" id="settings-image-proxy-allow-list-wrap" style="display: none">
        <fieldset class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact">
          <label for="settings-image-proxy-allow-list" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.image-proxy-allow-list-label"))}</label>
          ${_desc("settings-page.server.image-proxy-allow-list-desc")}
          <textarea id="settings-image-proxy-allow-list" data-save-key="imageProxyAllowList" class="settings-proxy-urls degoog-input" rows="4" placeholder="^192\.168\.&#10;^10\.&#10;jellyfin\.lan"></textarea>
        </fieldset>
      </div>
    </fieldset>
  </section>`;

const _renderRateLimitSection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card" id="settings-section-rate-limit">
    ${_h("settings-page.server.rate-limit-heading", "fa-solid fa-clock")}
    ${_desc("settings-page.server.rate-limit-desc")}
    <div class="settings-rate-limit-wrap" id="settings-rate-limit-wrap">
      <fieldset class="settings-fieldset">
        ${_toggle("settings-rate-limit-enabled", "settings-page.server.rate-limit-enable", { aria: "settings-page.server.rate-limit-enable-aria" })}
        <div class="settings-rate-limit-options" id="settings-rate-limit-options" style="display: none">
          <fieldset class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact">
            <p class="settings-rate-limit-defaults">${escapeHtml(t("settings-page.server.rate-limit-search-group"))} - ${escapeHtml(t("settings-page.server.rate-limit-defaults"))}</p>
            <div class="settings-rl-grid">
              <label for="settings-rate-limit-burst-window" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.rate-limit-burst-window"))}</label>
              <input type="number" id="settings-rate-limit-burst-window" class="settings-rate-limit-input settings-rate-limit-input--inline degoog-input" min="1" max="3600" placeholder="20" />
              <label for="settings-rate-limit-burst-max" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.rate-limit-burst-max"))}</label>
              <input type="number" id="settings-rate-limit-burst-max" class="settings-rate-limit-input settings-rate-limit-input--inline degoog-input" min="1" max="1000" placeholder="15" />
              <label for="settings-rate-limit-long-window" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.rate-limit-long-window"))}</label>
              <input type="number" id="settings-rate-limit-long-window" class="settings-rate-limit-input settings-rate-limit-input--inline degoog-input" min="1" max="3600" placeholder="600" />
              <label for="settings-rate-limit-long-max" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.rate-limit-long-max"))}</label>
              <input type="number" id="settings-rate-limit-long-max" class="settings-rate-limit-input settings-rate-limit-input--inline degoog-input" min="1" max="1000" placeholder="150" />
            </div>
          </fieldset>
        </div>
        ${_toggle("settings-rate-limit-suggest-enabled", "settings-page.server.rate-limit-suggest-enable")}
        <div id="settings-rate-limit-suggest-options" style="display: none">
          <fieldset class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact">
            <p class="settings-rate-limit-defaults">${escapeHtml(t("settings-page.server.rate-limit-suggest-group"))} - ${escapeHtml(t("settings-page.server.rate-limit-suggest-defaults"))}</p>
            <div class="settings-rl-grid">
              <label for="settings-rate-limit-suggest-burst-window" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.rate-limit-burst-window"))}</label>
              <input type="number" id="settings-rate-limit-suggest-burst-window" class="settings-rate-limit-input settings-rate-limit-input--inline degoog-input" min="1" max="3600" placeholder="20" />
              <label for="settings-rate-limit-suggest-burst-max" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.rate-limit-burst-max"))}</label>
              <input type="number" id="settings-rate-limit-suggest-burst-max" class="settings-rate-limit-input settings-rate-limit-input--inline degoog-input" min="1" max="1000" placeholder="60" />
              <label for="settings-rate-limit-suggest-long-window" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.rate-limit-long-window"))}</label>
              <input type="number" id="settings-rate-limit-suggest-long-window" class="settings-rate-limit-input settings-rate-limit-input--inline degoog-input" min="1" max="3600" placeholder="60" />
              <label for="settings-rate-limit-suggest-long-max" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.rate-limit-long-max"))}</label>
              <input type="number" id="settings-rate-limit-suggest-long-max" class="settings-rate-limit-input settings-rate-limit-input--inline degoog-input" min="1" max="1000" placeholder="120" />
              <label for="settings-ac-debounce-ms" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.ac-debounce"))}</label>
              <input type="number" id="settings-ac-debounce-ms" class="settings-rate-limit-input settings-rate-limit-input--inline degoog-input" min="0" max="2000" placeholder="300" />
            </div>
          </fieldset>
        </div>
      </fieldset>
    </div>
  </section>`;

const _renderHoneypotSection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card" id="settings-section-honeypot">
    ${_h("settings-page.server.honeypot-heading", "fa-solid fa-spider")}
    ${_desc("settings-page.server.honeypot-desc")}
    <fieldset class="settings-fieldset">
      ${_toggle("settings-honeypot-enabled", "settings-page.server.honeypot-enable", { aria: "settings-page.server.honeypot-enable-aria" })}
      ${_toggle("settings-honeypot-css-check", "settings-page.server.honeypot-css-check-enable", { aria: "settings-page.server.honeypot-css-check-aria", checked: true })}
      <fieldset class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact">
        <label for="settings-honeypot-ban-duration" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.honeypot-ban-duration-label"))}</label>
        ${_desc("settings-page.server.honeypot-ban-duration-desc")}
        <input type="text" id="settings-honeypot-ban-duration" data-save-key="honeypotBanDuration" class="degoog-input" min="0" placeholder="72" />
      </fieldset>
      <fieldset class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact">
        <label class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.honeypot-blocklist-label"))}</label>
        ${_desc("settings-page.server.honeypot-blocklist-desc")}
        <div class="settings-honeypot-ban-row">
          <input type="text" id="settings-honeypot-ban-ip" class="degoog-input" placeholder="192.168.1.100" spellcheck="false" />
          <button type="button" id="settings-honeypot-ban-add" class="degoog-btn degoog-btn--primary degoog-btn--sm">
            ${escapeHtml(t("settings-page.server.honeypot-ban-add"))}
          </button>
        </div>
        <div id="settings-honeypot-blocklist-rows"></div>
      </fieldset>
    </fieldset>
  </section>`;

const _renderCustomCssSection = (): string => `
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card" id="settings-section-custom-css">
    ${_h("settings-page.server.custom-css-heading", "fa-solid fa-code")}
    <fieldset class="settings-fieldset settings-fieldset-inverse settings-fieldset--compact">
      ${_desc("settings-page.server.custom-css-desc")}
      <label for="settings-custom-css" class="settings-proxy-urls-label">${escapeHtml(t("settings-page.server.custom-css-label"))}</label>
      <textarea id="settings-custom-css" data-save-key="customCss" class="settings-proxy-urls settings-custom-css degoog-input" rows="12" spellcheck="false" placeholder=".result-title { color: hotpink !important; }"></textarea>
    </fieldset>
  </section>`;

export const renderServerContent = (): string =>
  [
    _renderPresetSection(),
    _renderCacheSection(),
    _renderApiKeySection(),
    _renderIndexerSection(),
    _renderStreamingSection(),
    _renderLanguagesSection(),
    _renderDomainBlockSection(),
    _renderDomainReplaceSection(),
    _renderDomainScoreSection(),
    _renderProxySection(),
    _renderRateLimitSection(),
    _renderHoneypotSection(),
    _renderCustomCssSection(),
  ].join("");
