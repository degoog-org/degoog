import { SettingNum } from "../../shared/rows/setting-num";
import { SettingRow } from "../../shared/rows/setting-row";
import { tr } from "../i18n";

export interface IndexerNumRowProps {
  name: string;
  min: number;
  max?: number;
  unit?: string;
}

export const IndexerNumRow = ({ name, min, max, unit }: IndexerNumRowProps): JSX.Element => (
  <SettingRow label={tr(name)} desc={tr(`${name}-desc`)} forId={`indexer-${name}`}>
    <SettingNum id={`indexer-${name}`} min={min} max={max} unit={unit} />
  </SettingRow>
);
