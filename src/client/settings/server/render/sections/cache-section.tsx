import { Button } from "../../../../../shared/ui/components/primitives/button";
import { SettingGroup } from "../../../shared/rows/setting-group";
import { SettingRow } from "../../../shared/rows/setting-row";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

const CACHE_SCOPES = ["search", "autocomplete", "extensions", "all"] as const;

export const CacheSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-cache"
    heading="settings-page.server.cache-heading"
    icon="fa-solid fa-memory"
    desc="settings-page.server.cache-desc"
  >
    <SettingGroup>
      {CACHE_SCOPES.map((scope) => (
        <SettingRow
          label={t(`settings-page.server.cache-${scope}-label`)}
          desc={scope === "extensions" ? t("settings-page.server.cache-extensions-desc") : undefined}
        >
          <Button variant="secondary" id={`settings-cache-clear-${scope}`}>
            {t(`settings-page.server.cache-clear-${scope}`)}
          </Button>
        </SettingRow>
      ))}
    </SettingGroup>
  </ServerSection>
);
