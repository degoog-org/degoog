import { Checkbox } from "../../../../shared/ui/components/forms/checkbox";
import { EngineOriginSelect } from "./engine-origin-select";
import { REGION_HOST_ID, SEARCH_OPTION_TOGGLES } from "../toggles";

const t = window.scopedT("core");

export const SearchOptionFields = (): JSX.Element => (
  <>
    {SEARCH_OPTION_TOGGLES.map((opts) => (
      <Checkbox
        key={opts.id}
        id={opts.id}
        label={t(opts.labelKey)}
        aria={opts.ariaKey ? t(opts.ariaKey) : undefined}
        title={opts.titleKey ? t(opts.titleKey) : undefined}
        checked={opts.checked}
      />
    ))}
    <EngineOriginSelect />
    <div id={REGION_HOST_ID} hidden={true} />
  </>
);
