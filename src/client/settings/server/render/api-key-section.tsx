import { Icon } from "../../../../shared/ui/components/primitives/icon";
import { Button } from "../../../../shared/ui/components/primitives/button";
import { FIELDSET } from "./classes";
import { ServerSection } from "./server-section";
import { ServerToggle } from "./server-toggle";

const t = window.scopedT("core");

export const API_KEY_COPY_ICON = "fa-solid fa-copy fa-lg";

const API_KEY_ACTIONS = [
  { id: "settings-api-key-reveal", aria: "settings-page.server.api-key-reveal", icon: "fa-solid fa-eye fa-lg" },
  { id: "settings-api-key-copy", aria: "settings-page.server.api-key-copy", icon: API_KEY_COPY_ICON },
  { id: "settings-api-key-regenerate", aria: "settings-page.server.api-key-regenerate", icon: "fa-solid fa-rotate-right fa-lg" },
] as const;

export const ApiKeySection = (): JSX.Element => (
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
      <ServerToggle
        id="settings-api-key-search-enabled"
        label="settings-page.server.api-key-search-enable"
        aria="settings-page.server.api-key-search-aria"
        title="settings-page.server.api-key-search-tooltip"
      />
      <ServerToggle
        id="settings-api-key-suggest-enabled"
        label="settings-page.server.api-key-suggest-enable"
        aria="settings-page.server.api-key-suggest-aria"
        title="settings-page.server.api-key-suggest-tooltip"
      />
    </fieldset>
  </ServerSection>
);
