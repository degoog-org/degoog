import { Desc } from "../../../../shared/ui/components/forms/desc";
import { Icon } from "../../../../shared/ui/components/primitives/icon";
import { Badge } from "../../../../shared/ui/components/primitives/badge";
import { SECTION_CLASS } from "./classes";
import type { Child } from "../../../../shared/ui/tribute/types";

const t = window.scopedT("core");

export interface ServerSectionProps {
  id?: string;
  heading: string;
  icon: string;
  badge?: string;
  desc?: string;
  class?: string;
  collapsible?: boolean;
  open?: boolean;
  hidden?: boolean;
  children?: Child;
}

const _heading = (heading: string, badge?: string): JSX.Element => (
  <h2 class="settings-section-heading">
    {t(heading)}
    {badge ? <Badge modifier="experimental">{t(badge)}</Badge> : null}
  </h2>
);

const _icon = (icon: string): JSX.Element => (
  <div class="floating-section-icon">
    <Icon name={icon} />
  </div>
);

export const ServerSection = ({
  id,
  heading,
  icon,
  badge,
  desc,
  class: extra,
  collapsible = true,
  open = false,
  hidden,
  children,
}: ServerSectionProps): JSX.Element => {
  if (!collapsible) {
    return (
      <section class={extra ? `${SECTION_CLASS} ${extra}` : SECTION_CLASS} id={id} hidden={hidden}>
        <div class="setting-section-heading-wrapper">
          {_heading(heading, badge)}
          {_icon(icon)}
        </div>
        {desc ? <Desc text={t(desc)} /> : null}
        {children}
      </section>
    );
  }
  return (
    <section
      class={[SECTION_CLASS, "degoog-accordion", "settings-accordion", open ? "open" : "", extra ?? ""].filter(Boolean).join(" ")}
      id={id}
      hidden={hidden}
    >
      <div
        class="setting-section-heading-wrapper settings-accordion-toggle"
        role="button"
        tabindex="0"
        aria-expanded={open ? "true" : "false"}
        data-settings-accordion=""
      >
        <div class="settings-accordion-title">
          {_heading(heading, badge)}
          {desc ? <p class="settings-desc settings-accordion-summary">{t(desc)}</p> : null}
        </div>
        <div class="settings-accordion-icons">
          {_icon(icon)}
          <Icon name="fa-solid fa-chevron-down accordion-chevron" />
        </div>
      </div>
      <div class="degoog-accordion-body settings-accordion-body">{children}</div>
    </section>
  );
};

export const ServerGroup = ({ label, children }: { label: string; children?: Child }): JSX.Element => (
  <div class="settings-accordion-group">
    <h3 class="settings-accordion-group-heading">{t(label)}</h3>
    {children}
  </div>
);
