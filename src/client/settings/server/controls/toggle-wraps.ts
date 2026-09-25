import { setIndexerNavVisible } from "../../indexer/nav";
import { bindToggle, el, syncToggleWrap } from "../fields";

const TOGGLE_WRAP_PAIRS = [
  ["proxy-enabled", "proxy-urls-wrap"],
  ["image-proxy-allow-local", "image-proxy-allow-list-wrap"],
  ["languages-enabled", "languages-wrap"],
  ["rate-limit-enabled", "rate-limit-options"],
  ["rate-limit-suggest-enabled", "rate-limit-suggest-options"],
  ["streaming-enabled", "streaming-options"],
  ["streaming-auto-retry", "streaming-retry-wrap"],
  ["domain-block-enabled", "domain-block-wrap"],
  ["domain-replace-enabled", "domain-replace-wrap"],
  ["domain-score-enabled", "domain-score-wrap"],
  ["nojs-enabled", "nojs-wrap"],
] as const;

export const bindToggles = (): void => {
  for (const [toggleId, wrapId] of TOGGLE_WRAP_PAIRS) {
    bindToggle(toggleId, wrapId);
  }
};

export const syncDependentPanels = (): void => {
  for (const [toggleId, wrapId] of TOGGLE_WRAP_PAIRS) {
    syncToggleWrap(toggleId, wrapId);
  }
  const indexer = el("degoog-indexer-enabled");
  setIndexerNavVisible(indexer?.checked === true);
};
