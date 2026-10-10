export const PROXY_BULK_INPUT_ID = "settings-proxy-bulk-input";

const t = window.scopedT("core");

export const ProxyBulkBody = (): JSX.Element => (
  <label class="ext-field">
    <span class="ext-field-label">{t("settings-page.server.proxy-urls-label")}</span>
    <textarea
      id={PROXY_BULK_INPUT_ID}
      class="ext-field-input ext-field-textarea degoog-input"
      rows={10}
      spellcheck="false"
      autocomplete="off"
      placeholder={"http://proxy1:8080\nhttp://user:pass@proxy2:8080\nsocks5://proxy3:1080"}
    ></textarea>
    <p class="ext-field-desc">{t("settings-page.server.proxy-bulk-desc")}</p>
  </label>
);
