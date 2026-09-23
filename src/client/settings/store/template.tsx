import { CatalogSection } from "./catalog-section";
import { Lightbox } from "./lightbox-overlay";
import { ReposSection } from "./repos-section";

export const StoreTabTemplate = (): JSX.Element => (
  <>
    <ReposSection />
    <CatalogSection />
    <Lightbox />
  </>
);
