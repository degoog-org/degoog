import { Section } from "../../../shared/ui/components/layout/section";
import type { Child } from "../../../shared/ui/tribute/types";

const t = window.scopedT("core");

export interface GeneralCardProps {
  id?: string;
  icon: string;
  headingKey: string;
  children?: Child;
}

export const GeneralCard = ({ id, icon, headingKey, children }: GeneralCardProps): JSX.Element => (
  <Section id={id} class="settings-card" icon={icon} heading={t(headingKey)}>
    {children}
  </Section>
);
