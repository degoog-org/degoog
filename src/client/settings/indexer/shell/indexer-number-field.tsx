import { Desc } from "../../../../shared/ui/components/forms/desc";
import { LabelFor } from "./label-for";
import { NUMBER } from "./shell-consts";
import { tr } from "../i18n";

export const IndexerNumberField = ({
  name: fieldKey,
  min,
  max,
}: {
  name: string;
  min: number;
  max?: number;
}): JSX.Element => (
  <>
    <LabelFor id={`indexer-${fieldKey}`} k={fieldKey} />
    <input
      type="number"
      id={`indexer-${fieldKey}`}
      class={NUMBER}
      min={min}
      max={max}
      step={1}
    />
    <Desc text={tr(`${fieldKey}-desc`)} />
  </>
);
