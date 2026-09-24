import { ApiKeySection } from "./sections/api-key-section";
import { CacheSection } from "./sections/cache-section";
import { CompatSection } from "./sections/compat-section";
import { ConfigSection } from "./sections/config-section";
import { CustomCssSection } from "./sections/custom-css-section";
import { DomainSection } from "./sections/domain-section";
import { HoneypotSection } from "./sections/honeypot-section";
import { IndexerSection } from "./sections/indexer-section";
import { NojsSection } from "./sections/nojs-section";
import { ProxySection } from "./sections/proxy-section";
import { RateLimitSection } from "./sections/rate-limit-section";
import { RestartSection } from "./sections/restart-section";
import { SearchOptionsSection } from "./sections/search-options-section";

export const ServerContent = (): JSX.Element => (
  <>
    <RestartSection />
    <ConfigSection />
    <CacheSection />
    <ApiKeySection />
    <IndexerSection />
    <CompatSection />
    <SearchOptionsSection />
    <NojsSection />
    <DomainSection />
    <ProxySection />
    <RateLimitSection />
    <HoneypotSection />
    <CustomCssSection />
  </>
);
