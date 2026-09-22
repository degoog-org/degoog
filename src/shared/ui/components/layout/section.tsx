import { Icon } from "../primitives/icon";
import type { Child } from "../../tribute/types";

export interface SectionProps {
  id?: string;
  icon?: string;
  heading: string;
  desc?: string;
  children?: Child;
}

export const Section = ({
  id,
  icon,
  heading,
  desc,
  children,
}: SectionProps): JSX.Element => (
  <section
    class="settings-section ext-card degoog-panel degoog-panel--ext-card"
    id={id}
  >
    {icon ? (
      <div class="setting-section-heading-wrapper">
        <h2 class="settings-section-heading">{heading}</h2>
        <div class="floating-section-icon">
          <Icon name={icon} />
        </div>
      </div>
    ) : (
      <h2 class="settings-section-heading">{heading}</h2>
    )}
    {desc ? <p class="settings-desc">{desc}</p> : null}
    {children}
  </section>
);
