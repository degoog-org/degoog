import { renderHtml } from "../../../shared/ui/core/html";
import { raw } from "../../../shared/ui/core/raw";
import { Checkbox } from "../../../shared/ui/components/forms/checkbox";
import { Desc } from "../../../shared/ui/components/forms/desc";
import { FieldLabel } from "../../../shared/ui/components/forms/field-label";
import { NumberField } from "../../../shared/ui/components/forms/number-field";
import { Textarea } from "../../../shared/ui/components/forms/textarea";
import { Toggle } from "../../../shared/ui/components/forms/toggle";
import { SettingsSection } from "./settings-section";
import type {
  NumberOpts,
  SectionOpts,
  TextareaOpts,
  ToggleOpts,
} from "../../types/settings-section";

const t = window.scopedT("core");

export const renderToggle = (opts: ToggleOpts): string =>
  renderHtml(
    <Toggle
      id={opts.id}
      label={t(opts.labelKey)}
      aria={opts.ariaKey ? t(opts.ariaKey) : undefined}
      title={opts.titleKey ? t(opts.titleKey) : undefined}
      checked={opts.checked}
    />,
  );

export const renderCheckbox = (opts: ToggleOpts): string =>
  renderHtml(
    <Checkbox
      id={opts.id}
      label={t(opts.labelKey)}
      aria={opts.ariaKey ? t(opts.ariaKey) : undefined}
      title={opts.titleKey ? t(opts.titleKey) : undefined}
      checked={opts.checked}
    />,
  );

export const renderDesc = (key: string): string =>
  renderHtml(<Desc text={t(key)} />);

export const renderTextarea = (opts: TextareaOpts): string =>
  renderHtml(
    <>
      <FieldLabel htmlFor={opts.id} text={t(opts.labelKey)} />
      {opts.descKey ? <Desc text={t(opts.descKey)} /> : null}
      <Textarea id={opts.id} rows={opts.rows} placeholder={opts.placeholder} />
    </>,
  );

export const renderNumber = (opts: NumberOpts): string =>
  renderHtml(
    <>
      <FieldLabel htmlFor={opts.id} text={t(opts.labelKey)} />
      <NumberField
        id={opts.id}
        min={opts.min}
        max={opts.max}
        step={opts.step}
        placeholder={opts.placeholder}
        inline={opts.inline}
      />
    </>,
  );

export const renderSection = (opts: SectionOpts): string =>
  renderHtml(
    <SettingsSection
      id={opts.id}
      icon={opts.icon}
      headingKey={opts.headingKey}
      descKey={opts.descKey}
      noFieldset={opts.noFieldset}
      fieldsetClass={opts.fieldsetClass}
    >
      {raw(opts.content)}
    </SettingsSection>,
  );
