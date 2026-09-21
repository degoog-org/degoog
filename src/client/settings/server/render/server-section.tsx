import { Desc } from "../../../../shared/ui/components/forms/desc";
import { Icon } from "../../../../shared/ui/components/primitives/icon";
import { Badge } from "../../../../shared/ui/components/primitives/badge";
import { SECTION_CLASS } from "./classes";
import type { Child } from "../../../../shared/ui/core/types";

const t = window.scopedT("core");

export interface ServerSectionProps {
  id?: string;
  heading: string;
  icon: string;
  badge?: string;
  desc?: string;
  class?: string;
  children?: Child;
}

export const ServerSection = ({
  id,
  heading,
  icon,
  badge,
  desc,
  class: extra,
  children,
}: ServerSectionProps): JSX.Element => (
  <section class={extra ? `${SECTION_CLASS} ${extra}` : SECTION_CLASS} id={id}>
    <div class="setting-section-heading-wrapper">
      <h2 class="settings-section-heading">
        {t(heading)}
        {badge ? <Badge modifier="experimental">{t(badge)}</Badge> : null}
      </h2>
      <div class="floating-section-icon">
        <Icon name={icon} />
      </div>
    </div>
    {desc ? <Desc text={t(desc)} /> : null}
    {children}
  </section>
);
