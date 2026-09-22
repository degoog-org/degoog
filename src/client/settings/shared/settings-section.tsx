import { Section } from "../../../shared/ui/components/layout/section";
import type { Child } from "../../../shared/ui/tribute/types";

const t = window.scopedT("core");

export interface SettingsSectionProps {
  id?: string;
  icon?: string;
  headingKey: string;
  descKey?: string;
  noFieldset?: boolean;
  fieldsetClass?: string;
  children?: Child;
}

export const SettingsSection = ({
  id,
  icon,
  headingKey,
  descKey,
  noFieldset,
  fieldsetClass,
  children,
}: SettingsSectionProps): JSX.Element => (
  <Section
    id={id}
    icon={icon}
    heading={t(headingKey)}
    desc={descKey ? t(descKey) : undefined}
  >
    {noFieldset ? (
      children
    ) : (
      <fieldset
        class={
          fieldsetClass
            ? `settings-fieldset ${fieldsetClass}`
            : "settings-fieldset"
        }
      >
        {children}
      </fieldset>
    )}
  </Section>
);
