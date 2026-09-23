import { ListToggleSub } from "./list-toggle-sub";
import { ListInfoSub } from "./list-info-sub";
import { ListTextareaSub } from "./list-textarea-sub";
import { ListSelectSub } from "./list-select-sub";
import { ListHexSub } from "./list-hex-sub";
import { ListRangeSub } from "./list-range-sub";
import { ListFileSub } from "./list-file-sub";
import { ListInputSub } from "./list-input-sub";
import { isListToggle, isListDisplay, type ListRow } from "./list-field-data";
import type { SettingField } from "../../../../shared/setting-field";

export const ListSubField = ({
  sub,
  row,
}: {
  sub: SettingField;
  row: ListRow;
}): JSX.Element => {
  const value = row[sub.key] ?? "";
  if (isListToggle(sub)) return <ListToggleSub sub={sub} value={value} />;
  if (isListDisplay(sub)) return <ListInfoSub sub={sub} />;
  if (sub.type === "textarea") return <ListTextareaSub sub={sub} value={value} />;
  if (sub.type === "select") return <ListSelectSub sub={sub} value={value} />;
  if (sub.type === "hex") return <ListHexSub sub={sub} value={value} />;
  if (sub.type === "range") return <ListRangeSub sub={sub} value={value} />;
  if (sub.type === "file") return <ListFileSub sub={sub} value={value} />;
  return <ListInputSub sub={sub} value={value} />;
};
