import { ApiKeySection } from "./sections/api-key-section";
import { CacheSection } from "./sections/cache-section";
import { CompatSection } from "./sections/compat-section";
import { ConfigSection } from "./sections/config-section";
import { CustomCssSection } from "./sections/custom-css-section";
import { DomainSection } from "./sections/domain-section";
import { HoneypotSection } from "./sections/honeypot-section";
import { IndexerSection } from "./sections/indexer-section";
import { NojsSection } from "./sections/nojs-section";
import { PrivacySection } from "./sections/privacy-section";
import { ProxySection } from "./sections/proxy-section";
import { RateLimitSection } from "./sections/rate-limit-section";
import { RestartSection } from "./sections/restart-section";
import { SearchOptionsSection } from "./sections/search-options-section";
import { ServerGroup } from "./server-group";
import { ValkeyAlert } from "./valkey-alert";

export const ServerContent = (): JSX.Element => (
  <>
    <ValkeyAlert />
    <ServerGroup label="settings-page.server.group-instance">
      <RestartSection />
      <ConfigSection />
      <CacheSection />
      <CustomCssSection />
    </ServerGroup>
    <ServerGroup label="settings-page.server.group-search">
      <SearchOptionsSection />
      <CompatSection />
      <IndexerSection />
      <NojsSection />
      <DomainSection />
    </ServerGroup>
    <ServerGroup label="settings-page.server.group-network">
      <ProxySection />
      <PrivacySection />
      <RateLimitSection />
    </ServerGroup>
    <ServerGroup label="settings-page.server.group-security">
      <ApiKeySection />
      <HoneypotSection />
    </ServerGroup>
  </>
);
