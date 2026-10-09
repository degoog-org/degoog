import { Section } from "../../../shared/ui/components/layout/section";

const t = window.scopedT("core");

export const PublicEnginesHeader = (): JSX.Element => (
  <Section
    class="settings-card"
    icon="fa-solid fa-bolt"
    heading={t("settings-page.public.engines-heading")}
    desc={t("settings-page.public.engines-desc")}
  />
);
