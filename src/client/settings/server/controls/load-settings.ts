import { getBase } from "../../../utils/net/base-url";
import { authHeaders } from "../../../utils/net/request";
import type { ServerSettingsData } from "../../../types/settings-server";
import { setIndexerNavVisible } from "../../indexer/nav";
import { markOversized, oversizedMap } from "../../shared/oversized";
import { renderScoreRows } from "../domain-score";
import { el, setSelect, setToggle, setVal } from "../fields";
import { setCurrentServerSettings } from "./preset-controls";
import { initStreamingTypeChecks } from "./streaming-type-checks";

const t = window.scopedT("core");

export async function loadServerSettings(
  getToken: () => string | null,
): Promise<void> {
  try {
    const res = await fetch(`${getBase()}/api/settings/general`, {
      headers: authHeaders(getToken),
    });
    if (!res.ok) return;
    const data = (await res.json()) as ServerSettingsData;
    setCurrentServerSettings({ ...data });
    const oversized = oversizedMap(data as Record<string, unknown>);

    const setListVal = (id: string, key: string, value?: string): void => {
      const field = el(id);
      const info = oversized[key];
      if (field instanceof HTMLTextAreaElement && info) {
        markOversized(field, info, (vars) =>
          t(`settings-page.server.oversized`, vars),
        );
        return;
      }
      setVal(id, value);
    };

    setToggle("proxy-enabled", data.proxyEnabled);
    setVal("proxy-urls", data.proxyUrls);
    setToggle("image-proxy-allow-local", data.imageProxyAllowLocal);
    setVal("image-proxy-allow-list", data.imageProxyAllowList);

    setToggle("languages-enabled", data.languagesEnabled);
    setVal("languages", data.languages);

    setToggle("rate-limit-enabled", data.rateLimitEnabled);
    setVal("rate-limit-burst-window", data.rateLimitBurstWindow);
    setVal("rate-limit-burst-max", data.rateLimitBurstMax);
    setVal("rate-limit-long-window", data.rateLimitLongWindow);
    setVal("rate-limit-long-max", data.rateLimitLongMax);
    setToggle("rate-limit-suggest-enabled", data.rateLimitSuggestEnabled);
    setVal("rate-limit-suggest-burst-window", data.rateLimitSuggestBurstWindow);
    setVal("rate-limit-suggest-burst-max", data.rateLimitSuggestBurstMax);
    setVal("rate-limit-suggest-long-window", data.rateLimitSuggestLongWindow);
    setVal("rate-limit-suggest-long-max", data.rateLimitSuggestLongMax);
    setVal("ac-debounce-ms", data.acDebounceMs);
    setVal("request-body-max-kb", data.requestBodyMaxKb === "0" ? "" : data.requestBodyMaxKb);

    setToggle("streaming-enabled", data.streamingEnabled);
    setToggle("infinite-scroll-enabled", data.infiniteScrollEnabled);
    setToggle("streaming-auto-retry", data.streamingAutoRetry);
    setVal("streaming-max-retries", data.streamingMaxRetries);
    void initStreamingTypeChecks(data.streamingDisabledTypes ?? "", getToken);

    setToggle("domain-block-enabled", data.domainBlockEnabled);
    setListVal("domain-block-list", "domainBlockList", data.domainBlockList);
    setToggle("domain-block-ui-enabled", data.domainBlockUiEnabled);

    setToggle("domain-replace-enabled", data.domainReplaceEnabled);
    setListVal(
      "domain-replace-list",
      "domainReplaceList",
      data.domainReplaceList,
    );
    setToggle("domain-replace-ui-enabled", data.domainReplaceUiEnabled);

    setToggle("domain-score-enabled", data.domainScoreEnabled);
    if (!oversized.domainScoreList) renderScoreRows(data.domainScoreList ?? "");
    setToggle("domain-score-ui-enabled", data.domainScoreUiEnabled);

    setVal("custom-css", data.customCss);

    setToggle("api-key-search-enabled", data.apiKeySearchEnabled);
    setToggle("api-key-suggest-enabled", data.apiKeySuggestEnabled);

    setToggle("honeypot-enabled", data.honeypotEnabled ?? "true");
    setToggle("honeypot-css-check", data.honeypotCssCheck ?? "true");
    setVal("honeypot-ban-duration", data.honeypotBanDuration);

    setToggle("nojs-enabled", data.nojsEnabled);
    setToggle("nojs-css-check", data.nojsCssCheck);

    setSelect("engine-origin-display", data.engineOriginDisplay);

    setToggle("searx-compat-enabled", data.searxCompatEnabled);
    setToggle("searx-api-enabled", data.searxApiEnabled);
    setToggle("fourget-compat-enabled", data.fourgetCompatEnabled);
    setToggle("degoog-indexer-enabled", data.degoogIndexerEnabled);
    setIndexerNavVisible(
      data.degoogIndexerEnabled === true ||
        data.degoogIndexerEnabled === "true",
    );
  } catch (err) {
    console.warn("[settings] server settings load failed", err);
  }
}
