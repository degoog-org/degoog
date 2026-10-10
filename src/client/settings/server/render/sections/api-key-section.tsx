import { Icon } from "../../../../../shared/ui/components/primitives/icon";
import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingStackRow } from "../../../shared/rows/setting-stack-row";
import { SettingSwitchRow } from "../../../shared/rows/setting-switch-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

export const API_KEY_COPY_ICON = "fa-solid fa-copy";
export const API_KEY_REVEAL_ICON = "fa-solid fa-eye";
export const API_KEY_HIDE_ICON = "fa-solid fa-eye-slash";

const API_KEY_ACTIONS = [
  { id: "settings-api-key-reveal", label: "settings-page.server.api-key-reveal", icon: API_KEY_REVEAL_ICON },
  { id: "settings-api-key-copy", label: "settings-page.server.api-key-copy", icon: API_KEY_COPY_ICON },
  { id: "settings-api-key-regenerate", label: "settings-page.server.api-key-regenerate", icon: "fa-solid fa-rotate-right" },
] as const;

export const ApiKeySection = (): JSX.Element => (
  <ServerSection
    id="settings-section-api-key"
    heading="settings-page.server.api-key-heading"
    icon="fa-solid fa-key"
    desc="settings-page.server.api-key-desc"
  >
    <SettingGroup>
      <SettingStackRow label={t("settings-page.server.api-key-label")}>
        <div id="settings-api-key-controls" class="settings-key" style="display:none">
          <code id="settings-api-key-value" class="settings-key-value"></code>
          <span class="settings-key-actions">
            {API_KEY_ACTIONS.map((action, i) => (
              <button
                type="button"
                class="degoog-icon-btn settings-icon-btn"
                id={action.id}
                aria-label={t(action.label)}
                data-tooltip={t(action.label)}
                data-tooltip-end={i === API_KEY_ACTIONS.length - 1 ? true : undefined}
              >
                <Icon name={action.icon} />
              </button>
            ))}
          </span>
        </div>
        <p id="settings-api-key-locked" class="settings-row-desc" hidden={true}>
          {t("settings-page.server.api-key-no-password")}
        </p>
      </SettingStackRow>
    </SettingGroup>
    <SettingGroup id="settings-api-key-toggles" hidden={true}>
      <SettingSwitchRow
        id="settings-api-key-search-enabled"
        label={t("settings-page.server.api-key-search-enable")}
        desc={t("settings-page.server.api-key-search-tooltip")}
      />
      <SettingSwitchRow
        id="settings-api-key-suggest-enabled"
        label={t("settings-page.server.api-key-suggest-enable")}
        desc={t("settings-page.server.api-key-suggest-tooltip")}
      />
    </SettingGroup>
  </ServerSection>
);
