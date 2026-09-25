import { render } from "../../../shared/ui/tribute/dom";
import { getBase } from "../../utils/net/base-url";
import type { ButtonStateHandler } from "../../types/settings-server";
import { setIndexerNavVisible } from "../indexer/nav";
import { initProxyTest } from "./proxy-test";
import { el } from "./fields";
import { scoreRowTemplate } from "./domain-score";
import { initHoneypot } from "./honeypot";
import {
  bindSelectAutoSave,
  bindToggleAutoSave,
  injectFieldSaveBtns,
} from "./auto-save";
import { ServerContent } from "./render/server-content";
import { initBackupControls } from "./backup";
import { initApiKeyControls, loadApiKey } from "./controls/api-key";
import { loadServerSettings } from "./controls/load-settings";
import { initPresetControls } from "./controls/preset-controls";
import { bindRestartButton, syncRestartPending } from "./controls/restart";
import { bindToggles } from "./controls/toggle-wraps";

const t = window.scopedT("core");

export async function initServerTab(
  getToken: () => string | null,
): Promise<void> {
  const container = document.getElementById("server-content");
  if (container) render(<ServerContent />, container);

  bindRestartButton(getToken);
  void syncRestartPending(getToken);
  window.addEventListener("settings-tab-changed", (e) => {
    if ((e as CustomEvent<string>).detail === "server")
      void syncRestartPending(getToken);
  });
  bindToggles();

  document
    .getElementById("settings-domain-score-add")
    ?.addEventListener("click", () => {
      const wrap = document.getElementById("settings-domain-score-rows");
      wrap?.appendChild(scoreRowTemplate("", ""));
    });

  if (el("proxy-enabled")) initProxyTest(getToken);

  await loadServerSettings(getToken);

  await loadApiKey(getToken);

  initHoneypot(getToken);

  const handleButtonState: ButtonStateHandler = (
    id,
    action,
    successKey,
    failKey,
  ) => {
    const btn = document.getElementById(id);
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const prev = btn.textContent;
      try {
        await action();
        btn.textContent = t(successKey);
      } catch {
        if (failKey) btn.textContent = t(failKey);
      } finally {
        setTimeout(
          () => {
            btn.textContent = prev;
          },
          failKey ? 1500 : 1200,
        );
      }
    });
  };

  bindToggleAutoSave(getToken);
  bindSelectAutoSave(getToken);
  injectFieldSaveBtns(getToken);
  initPresetControls(getToken);
  initBackupControls(getToken);

  document
    .getElementById("settings-degoog-indexer-enabled")
    ?.addEventListener("change", (e) => {
      const on = (e.target as HTMLInputElement).checked;
      setIndexerNavVisible(on);
    });
  initApiKeyControls(getToken, handleButtonState);

  const CACHE_SCOPES = ["search", "autocomplete", "extensions", "all"] as const;
  for (const scope of CACHE_SCOPES) {
    handleButtonState(
      `settings-cache-clear-${scope}`,
      async () => {
        const res = await fetch(`${getBase()}/api/cache/clear?scope=${scope}`, {
          method: "POST",
        });
        if (!res.ok) throw new Error();
      },
      "settings-page.server.cache-cleared",
      "settings-page.server.cache-failed",
    );
  }
}
