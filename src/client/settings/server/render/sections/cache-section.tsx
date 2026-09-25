import { Button } from "../../../../../shared/ui/components/primitives/button";
import { ServerSection } from "../server-section";

const t = window.scopedT("core");

const CACHE_SCOPES = ["search", "autocomplete", "extensions", "all"] as const;

export const CacheSection = (): JSX.Element => (
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
