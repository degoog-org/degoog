import { ApiKeySection } from "./api-key-section";
import { CacheSection } from "./cache-section";
import { CompatSection } from "./compat-section";
import { ConfigSection } from "./config-section";
import { CustomCssSection } from "./custom-css-section";
import { DomainSection } from "./domain-section";
import { HoneypotSection } from "./honeypot-section";
import { IndexerSection } from "./indexer-section";
import { NojsSection } from "./nojs-section";
import { ProxySection } from "./proxy-section";
import { RateLimitSection } from "./rate-limit-section";
import { RestartSection } from "./restart-section";
import { SearchOptionsSection } from "./search-options-section";

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
