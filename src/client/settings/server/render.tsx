import { renderHtml } from "../../../shared/ui/core/html";
import { raw } from "../../../shared/ui/core/raw";
import { Desc } from "../../../shared/ui/components/forms/desc";
import { Toggle } from "../../../shared/ui/components/forms/toggle";
import { Icon } from "../../../shared/ui/components/primitives/icon";
import { Button } from "../../../shared/ui/components/primitives/button";
import { Badge } from "../../../shared/ui/components/primitives/badge";
import { renderFileUpload } from "../../utils/file-upload";
import { SERVER_SETTINGS_PRESETS } from "./presets";
import { ENGINE_ORIGIN_DISPLAY_VALUES } from "../../../shared/engine-origins";
import type { Child } from "../../../shared/ui/core/types";

const t = window.scopedT("core");

const SECTION_CLASS = "settings-section ext-card degoog-panel degoog-panel--ext-card";
const FIELDSET = "settings-fieldset";
const FIELDSET_INNER = "settings-fieldset settings-fieldset-inverse settings-fieldset--compact";
const WRAP = "settings-proxy-urls-wrap";
const LABEL = "settings-proxy-urls-label";
const TEXTAREA = "settings-proxy-urls degoog-input";
const NUM_INLINE = "settings-rate-limit-input settings-rate-limit-input--inline degoog-input";

interface SectionProps {
  id?: string;
  heading: string;
  icon: string;
  badge?: string;
  desc?: string;
  class?: string;
  children?: Child;
}

const ServerSection = ({ id, heading, icon, badge, desc, class: extra, children }: SectionProps): JSX.Element => (
  <section class={extra ? `${SECTION_CLASS} ${extra}` : SECTION_CLASS} id={id}>
    <div class="setting-section-heading-wrapper">
      <h2 class="settings-section-heading">
        {t(heading)}
        {badge ? <Badge modifier="experimental">{t(badge)}</Badge> : null}
      </h2>
      <div class="floating-section-icon">
        <Icon name={icon} />
      </div>
    </div>
    {desc ? <Desc text={t(desc)} /> : null}
    {children}
  </section>
);

interface TogProps {
  id: string;
  label: string;
  aria?: string;
  title?: string;
  checked?: boolean;
}

const Tog = ({ id, label, aria, title, checked }: TogProps): JSX.Element => (
  <Toggle
    id={id}
    label={t(label)}
    aria={aria ? t(aria) : undefined}
    title={title ? t(title) : undefined}
    checked={checked}
  />
);

const D = ({ k }: { k: string }): JSX.Element => <Desc text={t(k)} />;

const Sub = ({ k }: { k: string }): JSX.Element => (
  <h3 class="settings-subheading">{t(k)}</h3>
);

const Label = ({ htmlFor, k }: { htmlFor?: string; k: string }): JSX.Element => (
  <label for={htmlFor} class={LABEL}>
    {t(k)}
  </label>
);

const NumInline = ({ id, min, max, placeholder }: { id: string; min: number; max: number; placeholder: string }): JSX.Element => (
  <input type="number" id={id} class={NUM_INLINE} min={min} max={max} placeholder={placeholder} />
);

const RestartSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-restart"
    heading="settings-page.server.restart-heading"
    icon="fa-solid fa-power-off"
    desc="settings-page.server.restart-desc"
  >
    <div class="settings-server-restart-pending" id="settings-server-restart-pending" hidden={true}>
      <p class="store-restart-intro">{t("settings-page.restart.modal-intro")}</p>
      <ul class="store-restart-list" id="settings-server-restart-reasons"></ul>
    </div>
    <Button variant="secondary" id="settings-server-restart">
      {t("settings-page.server.restart-button")}
    </Button>
  </ServerSection>
);

const PresetsBlock = (): JSX.Element => (
  <div class="settings-server-block">
    <Sub k="settings-page.server.config.presets-label" />
    <D k="settings-page.server.presets.desc" />
    <div class={FIELDSET}>
      <div class="degoog-select-wrap">
        <select
          id="settings-server-preset-select"
          class="settings-server-preset-select degoog-input"
          aria-label={t("settings-page.server.presets.select-label")}
        >
          <option value="">{t("settings-page.server.presets.select-placeholder")}</option>
          {SERVER_SETTINGS_PRESETS.map((preset) => (
            <option value={preset.id}>{t(preset.labelKey)}</option>
          ))}
        </select>
      </div>
      <div class="settings-server-preset-preview" id="settings-server-preset-preview" hidden={true}>
        <p class="settings-desc" id="settings-server-preset-description"></p>
        <div class="settings-server-preset-block" id="settings-server-preset-warnings" hidden={true}>
          <strong class="settings-server-preset-title">
            {t("settings-page.server.presets.warnings-heading")}
          </strong>
          <ul class="settings-server-preset-list" id="settings-server-preset-warning-list"></ul>
        </div>
        <div class="settings-server-preset-block">
          <strong class="settings-server-preset-title">
            {t("settings-page.server.presets.changes-heading")}
          </strong>
          <ul class="settings-server-preset-list" id="settings-server-preset-change-list"></ul>
        </div>
        <div class="settings-server-preset-actions">
          <Button variant="primary" id="settings-server-preset-apply">
            {t("settings-page.server.presets.apply")}
          </Button>
          <span
            class="settings-server-preset-status"
            id="settings-server-preset-status"
            role="status"
            aria-live="polite"
          ></span>
        </div>
      </div>
    </div>
  </div>
);

const BackupBlock = (): JSX.Element => (
  <div class="settings-server-block" id="settings-server-backup">
    <Sub k="settings-page.server.config.backup-label" />
    <D k="settings-page.server.backup.desc" />
    <p class="settings-desc settings-backup-note">
      {t("settings-page.server.backup.manual-extensions")}
    </p>
    <div class="settings-backup-row">
      <Button variant="secondary" class="settings-backup-action" id="settings-backup-export">
        {t("settings-page.server.backup.export-button")}
      </Button>
      {raw(
        renderFileUpload({
          inputId: "settings-backup-file",
          buttonLabel: t("settings-page.server.backup.import-choose"),
          dropLabel: t("settings-page.server.backup.import-drop"),
          accept: "application/json,.json",
        }),
      )}
      <Button
        variant="primary"
        class="settings-backup-action"
        id="settings-backup-import"
        disabled={true}
      >
        {t("settings-page.server.backup.import-button")}
      </Button>
    </div>
    <span
      class="settings-server-preset-status"
      id="settings-backup-status"
      role="status"
      aria-live="polite"
    ></span>
  </div>
);

const CACHE_SCOPES = ["search", "autocomplete", "extensions", "all"] as const;

const CacheSection = (): JSX.Element => (
  <ServerSection
    heading="settings-page.server.cache-heading"
    icon="fa-solid fa-memory"
    desc="settings-page.server.cache-desc"
  >
    <div class="settings-cache-buttons">
      {CACHE_SCOPES.map((scope) => (
        <Button
          variant="secondary"
          class="settings-cache-clear"
          id={`settings-cache-clear-${scope}`}
          data-cache-scope={scope}
        >
          {t(`settings-page.server.cache-clear-${scope}`)}
        </Button>
      ))}
    </div>
  </ServerSection>
);

const API_KEY_ACTIONS = [
  { id: "settings-api-key-reveal", aria: "settings-page.server.api-key-reveal", icon: "fa-solid fa-eye fa-lg" },
  { id: "settings-api-key-copy", aria: "settings-page.server.api-key-copy", icon: "fa-solid fa-copy fa-lg" },
  { id: "settings-api-key-regenerate", aria: "settings-page.server.api-key-regenerate", icon: "fa-solid fa-rotate-right fa-lg" },
] as const;

const ApiKeySection = (): JSX.Element => (
  <ServerSection
    id="settings-section-api-key"
    heading="settings-page.server.api-key-heading"
    icon="fa-solid fa-key"
    desc="settings-page.server.api-key-desc"
  >
    <div class="settings-toggle-wrap settings-desc degoog-toggle-wrap">
      <div id="settings-api-key-controls" class="settings-api-wrapper" style="display:none">
        <code id="settings-api-key-value" class="settings-toggle-label"></code>
        <div>
          {API_KEY_ACTIONS.map((action) => (
            <Button variant="secondary" id={action.id} aria-label={t(action.aria)}>
              <Icon name={action.icon} />
            </Button>
          ))}
        </div>
      </div>
      <p id="settings-api-key-locked" class="settings-desc" hidden={true}>
        {t("settings-page.server.api-key-no-password")}
      </p>
    </div>
    <fieldset class={FIELDSET} id="settings-api-key-toggles" style="display:none">
      <Tog
        id="settings-api-key-search-enabled"
        label="settings-page.server.api-key-search-enable"
        aria="settings-page.server.api-key-search-aria"
        title="settings-page.server.api-key-search-tooltip"
      />
      <Tog
        id="settings-api-key-suggest-enabled"
        label="settings-page.server.api-key-suggest-enable"
        aria="settings-page.server.api-key-suggest-aria"
        title="settings-page.server.api-key-suggest-tooltip"
      />
    </fieldset>
  </ServerSection>
);

const IndexerSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-indexer"
    heading="settings-page.server.indexer-heading"
    icon="fa-solid fa-database"
    desc="settings-page.server.indexer-desc"
  >
    <fieldset class={FIELDSET}>
      <Tog
        id="settings-degoog-indexer-enabled"
        label="settings-page.server.indexer-enable"
        aria="settings-page.server.indexer-enable-aria"
      />
      <D k="settings-page.server.indexer-enable-desc" />
    </fieldset>
  </ServerSection>
);

const CompatSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-searx"
    heading="settings-page.server.compat-heading"
    icon="fa-solid fa-flask"
    desc="settings-page.server.compat-desc"
  >
    <fieldset class={FIELDSET}>
      <Tog id="settings-searx-compat-enabled" label="settings-page.server.searx-enable" aria="settings-page.server.searx-enable-aria" />
      <D k="settings-page.server.searx-enable-desc" />
      <Tog id="settings-searx-api-enabled" label="settings-page.server.searx-api-enable" aria="settings-page.server.searx-api-enable-aria" />
      <D k="settings-page.server.searx-api-enable-desc" />
      <Tog id="settings-fourget-compat-enabled" label="settings-page.server.4get-enable" aria="settings-page.server.4get-enable-aria" />
      <D k="settings-page.server.4get-enable-desc" />
    </fieldset>
  </ServerSection>
);

const SearchOptionsSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-search-options"
    heading="settings-page.server.search-options-heading"
    icon="fa-solid fa-arrow-down-1-9"
    desc="settings-page.server.search-options-desc"
  >
    <fieldset class={FIELDSET}>
      <Tog
        id="settings-infinite-scroll-enabled"
        label="settings-page.server.infinite-scroll-enable"
        aria="settings-page.server.infinite-scroll-enable-aria"
      />
      <D k="settings-page.server.infinite-scroll-enable-desc" />

      <div class="settings-server-block">
        <Sub k="settings-page.server.engine-origins-label" />
        <D k="settings-page.server.engine-origins-desc" />
        <div class="degoog-select-wrap">
          <select
            id="settings-engine-origin-display"
            class="degoog-input"
            aria-label={t("settings-page.server.engine-origins-label")}
          >
            {ENGINE_ORIGIN_DISPLAY_VALUES.map((value) => (
              <option value={value}>{t(`settings-page.server.engine-origins-${value}`)}</option>
            ))}
          </select>
        </div>
      </div>

      <Tog id="settings-languages-enabled" label="settings-page.server.languages-toggle" aria="settings-page.server.languages-toggle-aria" />
      <D k="settings-page.server.languages-desc" />
      <div
        class="settings-proxy-urls-wrap settings-fieldset settings-fieldset-inverse settings-fieldset--compact"
        id="settings-languages-wrap"
        style="display: none"
      >
        <Label htmlFor="settings-languages" k="settings-page.server.languages-codes-label" />
        <textarea
          id="settings-languages"
          data-save-key="languages"
          class={TEXTAREA}
          rows={5}
          placeholder={"en\nit\nde\nfr\nes"}
        ></textarea>
      </div>

      <Tog
        id="settings-streaming-enabled"
        label="settings-page.server.streaming-enable"
        aria="settings-page.server.streaming-enable-aria"
        title="settings-page.server.streaming-enable-tooltip"
      />
      <D k="settings-page.server.streaming-desc" />
      <div class="settings-streaming-options" id="settings-streaming-options" style="display: none">
        <fieldset class="settings-fieldset settings-fieldset--compact">
          <div id="settings-streaming-type-checks" class="settings-streaming-type-checks"></div>
          <Tog id="settings-streaming-auto-retry" label="settings-page.server.streaming-auto-retry" aria="settings-page.server.streaming-auto-retry-aria" />
          <div
            class="settings-streaming-retry-wrap settings-fieldset settings-fieldset-inverse settings-fieldset--compact"
            id="settings-streaming-retry-wrap"
            style="display: none"
          >
            <Label htmlFor="settings-streaming-max-retries" k="settings-page.server.streaming-max-retries-label" />
            <input
              type="number"
              id="settings-streaming-max-retries"
              data-save-key="streamingMaxRetries"
              class="settings-rate-limit-input degoog-input"
              min={1}
              max={5}
              placeholder="2"
            />
          </div>
        </fieldset>
      </div>
    </fieldset>
  </ServerSection>
);

const NojsSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-nojs"
    heading="settings-page.server.nojs-heading"
    icon="fa-solid fa-file-code"
    badge="settings-page.extensions.compat-experimental"
    desc="settings-page.server.nojs-desc"
  >
    <fieldset class={FIELDSET}>
      <Tog id="settings-nojs-enabled" label="settings-page.server.nojs-enable" aria="settings-page.server.nojs-enable-aria" />
      <div class={WRAP} id="settings-nojs-wrap" style="display: none">
        <fieldset class={FIELDSET_INNER}>
          <Tog id="settings-nojs-css-check" label="settings-page.server.nojs-css-check-enable" />
          <D k="settings-page.server.nojs-css-check-desc" />
        </fieldset>
      </div>
    </fieldset>
  </ServerSection>
);

const DomainSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-domain-management"
    heading="settings-page.server.domain-management-heading"
    icon="fa-solid fa-globe"
    desc="settings-page.server.domain-management-desc"
  >
    <fieldset class={FIELDSET}>
      <Tog id="settings-domain-block-enabled" label="settings-page.server.domain-block-enable" aria="settings-page.server.domain-block-enable-aria" />
      <D k="settings-page.server.domain-block-desc" />
      <div class={WRAP} id="settings-domain-block-wrap" style="display: none">
        <fieldset class={FIELDSET_INNER}>
          <Label htmlFor="settings-domain-block-list" k="settings-page.server.domain-block-list-label" />
          <D k="settings-page.server.domain-block-regex-help" />
          <textarea
            id="settings-domain-block-list"
            data-save-key="domainBlockList"
            class={TEXTAREA}
            rows={5}
            placeholder={"quora.com\ntiktok.com\n/.*\\.spam\\.net/"}
          ></textarea>
          <Tog id="settings-domain-block-ui-enabled" label="settings-page.server.domain-block-ui-enable" />
          <D k="settings-page.server.domain-block-ui-desc" />
        </fieldset>
      </div>

      <Tog id="settings-domain-replace-enabled" label="settings-page.server.domain-replace-enable" aria="settings-page.server.domain-replace-enable-aria" />
      <D k="settings-page.server.domain-replace-desc" />
      <div class={WRAP} id="settings-domain-replace-wrap" style="display: none">
        <fieldset class={FIELDSET_INNER}>
          <Label htmlFor="settings-domain-replace-list" k="settings-page.server.domain-replace-list-label" />
          <textarea
            id="settings-domain-replace-list"
            data-save-key="domainReplaceList"
            class={TEXTAREA}
            rows={5}
            placeholder={
              "reddit.com -> teddit.example.com\ntwitter.com -> nitter.example.com\nwikipedia.org -> https://wiki.example.com/viewer#wikipedia_en_all{{path}}"
            }
          ></textarea>
          <Tog id="settings-domain-replace-ui-enabled" label="settings-page.server.domain-replace-ui-enable" />
          <D k="settings-page.server.domain-replace-ui-desc" />
        </fieldset>
      </div>

      <Tog id="settings-domain-score-enabled" label="settings-page.server.domain-score-enable" />
      <D k="settings-page.server.domain-score-desc" />
      <div class={WRAP} id="settings-domain-score-wrap" style="display: none">
        <fieldset class={FIELDSET_INNER}>
          <span class={LABEL}>{t("settings-page.server.domain-score-list-label")}</span>
          <div id="settings-domain-score-rows" class="settings-score-rows"></div>
          <button type="button" id="settings-domain-score-add" class="settings-score-add">
            {t("settings-page.server.domain-score-add-row")}
          </button>
          <Tog id="settings-domain-score-ui-enabled" label="settings-page.server.domain-score-ui-enable" />
          <D k="settings-page.server.domain-score-ui-desc" />
        </fieldset>
      </div>
    </fieldset>
  </ServerSection>
);

const ProxySection = (): JSX.Element => (
  <ServerSection
    id="settings-section-proxy"
    heading="settings-page.server.proxy-heading"
    icon="fa-solid fa-network-wired"
    desc="settings-page.server.proxy-desc"
  >
    <fieldset class={FIELDSET}>
      <Tog id="settings-proxy-enabled" label="settings-page.server.proxy-enable" aria="settings-page.server.proxy-enable-aria" />
      <div class={WRAP} id="settings-proxy-urls-wrap" style="display: none">
        <fieldset class={FIELDSET_INNER}>
          <Label htmlFor="settings-proxy-urls" k="settings-page.server.proxy-urls-label" />
          <textarea
            id="settings-proxy-urls"
            data-save-key="proxyUrls"
            class={TEXTAREA}
            rows={4}
            placeholder={"http://proxy1:8080\nhttp://user:pass@proxy2:8080\nsocks5://proxy3:1080"}
          ></textarea>
          <Button variant="secondary" class="proxy-test-btn" id="settings-proxy-test">
            {t("settings-page.server.proxy-test")}
          </Button>
          <div class="proxy-test-result" id="settings-proxy-test-result" hidden={true}></div>
        </fieldset>
      </div>
      <Tog id="settings-image-proxy-allow-local" label="settings-page.server.image-proxy-allow-local" aria="settings-page.server.image-proxy-allow-local-aria" />
      <div class={WRAP} id="settings-image-proxy-allow-list-wrap" style="display: none">
        <fieldset class={FIELDSET_INNER}>
          <Label htmlFor="settings-image-proxy-allow-list" k="settings-page.server.image-proxy-allow-list-label" />
          <D k="settings-page.server.image-proxy-allow-list-desc" />
          <textarea
            id="settings-image-proxy-allow-list"
            data-save-key="imageProxyAllowList"
            class={TEXTAREA}
            rows={4}
            placeholder={"^192\\.168\\.\n^10\\.\njellyfin\\.lan"}
          ></textarea>
        </fieldset>
      </div>
    </fieldset>
  </ServerSection>
);

const SEARCH_LIMITS = [
  { id: "settings-rate-limit-burst-window", k: "settings-page.server.rate-limit-burst-window", min: 1, max: 3600, placeholder: "20" },
  { id: "settings-rate-limit-burst-max", k: "settings-page.server.rate-limit-burst-max", min: 1, max: 1000, placeholder: "15" },
  { id: "settings-rate-limit-long-window", k: "settings-page.server.rate-limit-long-window", min: 1, max: 3600, placeholder: "600" },
  { id: "settings-rate-limit-long-max", k: "settings-page.server.rate-limit-long-max", min: 1, max: 1000, placeholder: "150" },
] as const;

const SUGGEST_LIMITS = [
  { id: "settings-rate-limit-suggest-burst-window", k: "settings-page.server.rate-limit-burst-window", min: 1, max: 3600, placeholder: "20" },
  { id: "settings-rate-limit-suggest-burst-max", k: "settings-page.server.rate-limit-burst-max", min: 1, max: 1000, placeholder: "60" },
  { id: "settings-rate-limit-suggest-long-window", k: "settings-page.server.rate-limit-long-window", min: 1, max: 3600, placeholder: "60" },
  { id: "settings-rate-limit-suggest-long-max", k: "settings-page.server.rate-limit-long-max", min: 1, max: 1000, placeholder: "120" },
  { id: "settings-ac-debounce-ms", k: "settings-page.server.ac-debounce", min: 0, max: 2000, placeholder: "300" },
] as const;

const LimitGrid = ({ fields }: { fields: readonly { id: string; k: string; min: number; max: number; placeholder: string }[] }): JSX.Element => (
  <div class="settings-rl-grid">
    {fields.map((field) => (
      <>
        <Label htmlFor={field.id} k={field.k} />
        <NumInline id={field.id} min={field.min} max={field.max} placeholder={field.placeholder} />
      </>
    ))}
  </div>
);

const RateLimitSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-rate-limit"
    heading="settings-page.server.rate-limit-heading"
    icon="fa-solid fa-clock"
    desc="settings-page.server.rate-limit-desc"
  >
    <div class="settings-rate-limit-wrap" id="settings-rate-limit-wrap">
      <fieldset class={FIELDSET}>
        <Tog id="settings-rate-limit-enabled" label="settings-page.server.rate-limit-enable" aria="settings-page.server.rate-limit-enable-aria" />
        <div class="settings-rate-limit-options" id="settings-rate-limit-options" style="display: none">
          <fieldset class={FIELDSET_INNER}>
            <p class="settings-rate-limit-defaults">
              {`${t("settings-page.server.rate-limit-search-group")} - ${t("settings-page.server.rate-limit-defaults")}`}
            </p>
            <LimitGrid fields={SEARCH_LIMITS} />
          </fieldset>
        </div>
        <Tog id="settings-rate-limit-suggest-enabled" label="settings-page.server.rate-limit-suggest-enable" />
        <div id="settings-rate-limit-suggest-options" style="display: none">
          <fieldset class={FIELDSET_INNER}>
            <p class="settings-rate-limit-defaults">
              {`${t("settings-page.server.rate-limit-suggest-group")} - ${t("settings-page.server.rate-limit-suggest-defaults")}`}
            </p>
            <LimitGrid fields={SUGGEST_LIMITS} />
          </fieldset>
        </div>
      </fieldset>
    </div>
  </ServerSection>
);

const HoneypotSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-honeypot"
    heading="settings-page.server.honeypot-heading"
    icon="fa-solid fa-spider"
    desc="settings-page.server.honeypot-desc"
  >
    <fieldset class={FIELDSET}>
      <Tog id="settings-honeypot-enabled" label="settings-page.server.honeypot-enable" aria="settings-page.server.honeypot-enable-aria" />
      <Tog id="settings-honeypot-css-check" label="settings-page.server.honeypot-css-check-enable" aria="settings-page.server.honeypot-css-check-aria" checked={true} />
      <fieldset class={FIELDSET_INNER}>
        <Label htmlFor="settings-honeypot-ban-duration" k="settings-page.server.honeypot-ban-duration-label" />
        <D k="settings-page.server.honeypot-ban-duration-desc" />
        <input type="text" id="settings-honeypot-ban-duration" data-save-key="honeypotBanDuration" class="degoog-input" min={0} placeholder="72" />
      </fieldset>
      <fieldset class={FIELDSET_INNER}>
        <label class={LABEL}>{t("settings-page.server.honeypot-blocklist-label")}</label>
        <D k="settings-page.server.honeypot-blocklist-desc" />
        <div class="settings-honeypot-ban-row">
          <input type="text" id="settings-honeypot-ban-ip" class="degoog-input" placeholder="192.168.1.100" spellcheck="false" />
          <button type="button" id="settings-honeypot-ban-add" class="degoog-btn degoog-btn--primary degoog-btn--sm">
            {t("settings-page.server.honeypot-ban-add")}
          </button>
        </div>
        <div id="settings-honeypot-blocklist-rows"></div>
      </fieldset>
    </fieldset>
  </ServerSection>
);

const CustomCssSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-custom-css"
    heading="settings-page.server.custom-css-heading"
    icon="fa-solid fa-code"
  >
    <fieldset class={FIELDSET_INNER}>
      <D k="settings-page.server.custom-css-desc" />
      <Label htmlFor="settings-custom-css" k="settings-page.server.custom-css-label" />
      <textarea
        id="settings-custom-css"
        data-save-key="customCss"
        class="settings-proxy-urls settings-custom-css degoog-input"
        rows={12}
        spellcheck="false"
        placeholder=".result-title { color: hotpink !important; }"
      ></textarea>
    </fieldset>
  </ServerSection>
);

const ConfigSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-server-presets"
    heading="settings-page.server.config.heading"
    icon="fa-solid fa-sliders"
    class="settings-server-presets"
  >
    <PresetsBlock />
    <BackupBlock />
  </ServerSection>
);

export const renderServerContent = (): string =>
  renderHtml(
    <>
      <RestartSection />
      <ConfigSection />
      <CacheSection />
      <ApiKeySection />
      <IndexerSection />
      <CompatSection />
      <SearchOptionsSection />
      <NojsSection />
      <DomainSection />
      <ProxySection />
      <RateLimitSection />
      <HoneypotSection />
      <CustomCssSection />
    </>,
  );
