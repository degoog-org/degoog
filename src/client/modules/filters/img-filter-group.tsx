import { Chevron } from "../../../shared/ui/components/layout/chevron";
import { ImgFilterOption } from "./img-filter-option";
import { ImgFilterSuffix } from "./img-filter-suffix";

export interface ImgFilterGroupProps {
  group: string;
  title: string;
  values: string[];
  active: string;
  labelFor: (value: string) => string;
  defaultLabel: string;
}

export const ImgFilterGroup = ({
  group,
  title,
  values,
  active,
  labelFor,
  defaultLabel,
}: ImgFilterGroupProps): JSX.Element => (
  <div class="degoog-accordion degoog-img-filter-group degoog-panel degoog-panel--accordion degoog-panel--stack-item">
    <button class="degoog-accordion-toggle" type="button" aria-expanded="false">
      <span class="degoog-img-filter-head">
        {title}
        {active ? <ImgFilterSuffix label={labelFor(active)} /> : null}
      </span>
      <Chevron />
    </button>
    <div
      class="degoog-accordion-body degoog-img-filter-options degoog-scrollbar"
      role="radiogroup"
      aria-label={title}
    >
      <ImgFilterOption group={group} value="" label={defaultLabel} active={active === ""} />
      {values.map((value) => (
        <ImgFilterOption
          key={value}
          group={group}
          value={value}
          label={labelFor(value)}
          active={value === active}
        />
      ))}
    </div>
  </div>
);
