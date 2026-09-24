import { SidebarAccordion } from "../../../../shared/ui/components/layout/sidebar-accordion";
import { RelatedSearchLink } from "./related-search-link";

const t = window.scopedT("themes/degoog");

export const RelatedSearches = ({ terms }: { terms: string[] }): JSX.Element => (
  <SidebarAccordion title={t("search-templates.sidebar.people-also-search")}>
    {terms.map((term) => (
      <RelatedSearchLink term={term} />
    ))}
  </SidebarAccordion>
);
