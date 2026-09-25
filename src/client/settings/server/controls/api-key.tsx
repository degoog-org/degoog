import { render } from "../../../../shared/ui/tribute/dom";
import { Icon } from "../../../../shared/ui/components/primitives/icon";
import { copyTextToClipboard } from "../../../utils/dom/clipboard";
import { getBase } from "../../../utils/net/base-url";
import { authHeaders } from "../../../utils/net/request";
import type { ButtonStateHandler } from "../../../types/settings-server";
import { API_KEY_COPY_ICON } from "../render/sections/api-key-section";

const t = window.scopedT("core");

let _apiKey = "";
let _keyRevealed = false;

function _renderApiKey(): void {
  const element = document.getElementById("settings-api-key-value");
  if (!element) return;
  element.textContent = _keyRevealed
    ? _apiKey
    : "•".repeat(Math.min(_apiKey.length, 32));
}

export const initApiKeyControls = (
  getToken: () => string | null,
  handleButtonState: ButtonStateHandler,
): void => {
  document
    .getElementById("settings-api-key-reveal")
    ?.addEventListener("click", () => {
      _keyRevealed = !_keyRevealed;
      _renderApiKey();
      const btn = document.getElementById("settings-api-key-reveal");
      if (btn)
        render(
          <Icon
            name={
              _keyRevealed
                ? "fa-solid fa-eye-slash fa-lg"
                : "fa-solid fa-eye fa-lg"
            }
          />,
          btn,
        );
      if (btn)
        btn.setAttribute(
          "aria-label",
          t(
            _keyRevealed
              ? "settings-page.server.api-key-hide"
              : "settings-page.server.api-key-reveal",
          ),
        );
    });

  document
    .getElementById("settings-api-key-copy")
    ?.addEventListener("click", () => {
      if (!_apiKey) return;
      const btn = document.getElementById("settings-api-key-copy");
      if (!btn) return;
      void copyTextToClipboard(_apiKey).then((ok) => {
        if (!ok) return;
        btn.textContent = t("settings-page.server.api-key-copied");
        setTimeout(() => {
          render(<Icon name={API_KEY_COPY_ICON} />, btn);
        }, 1200);
      });
    });

  handleButtonState(
    "settings-api-key-regenerate",
    async () => {
      const res = await fetch(`${getBase()}/api/settings/api-key/regenerate`, {
        method: "POST",
        headers: authHeaders(getToken),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { key: string };
      _apiKey = data.key;
      _keyRevealed = false;
      _renderApiKey();
      const revealBtn = document.getElementById("settings-api-key-reveal");
      if (revealBtn)
        revealBtn.textContent = t("settings-page.server.api-key-reveal");
    },
    "settings-page.server.api-key-regenerated",
    "settings-page.server.api-key-regenerate-failed",
  );
};

export const loadApiKey = async (getToken: () => string | null): Promise<void> => {
  try {
    const apiKeyRes = await fetch(`${getBase()}/api/settings/api-key`, {
      headers: authHeaders(getToken),
    });
    const controls = document.getElementById("settings-api-key-controls");
    const locked = document.getElementById("settings-api-key-locked");
    const toggles = document.getElementById("settings-api-key-toggles");
    if (apiKeyRes.ok) {
      const apiKeyData = (await apiKeyRes.json()) as {
        key: string;
        searchEnabled: boolean;
        suggestEnabled: boolean;
      };
      _apiKey = apiKeyData.key;
      _renderApiKey();
      if (controls) controls.style.display = "";
      if (toggles) toggles.style.display = "";
    } else if (apiKeyRes.status === 403) {
      if (locked) locked.hidden = false;
    }
  } catch (err) {
    console.warn("[settings] api key load failed", err);
  }
};
