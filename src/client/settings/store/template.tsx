import { CatalogSection } from "./sections/catalog-section";
import { Lightbox } from "./overlays/lightbox-overlay";
import { ReposSection } from "./sections/repos-section";

export const StoreTabTemplate = (): JSX.Element => (
  <>
    <ReposSection />
    <CatalogSection />
    <Lightbox />
  </>
);
