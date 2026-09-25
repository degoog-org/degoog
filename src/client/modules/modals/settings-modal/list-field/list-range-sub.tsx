import type { SettingField } from "../../../../../shared/setting-field";

export const ListRangeSub = ({
  sub,
  value,
}: {
  sub: SettingField;
  value: string;
}): JSX.Element => {
  const min = sub.min ?? "0";
  const max = sub.max ?? "100";
  const step = sub.step ?? "1";
  const current = value !== "" ? value : (sub.default ?? min);
  return (
    <div class="ext-list-sub">
      <span class="ext-list-sub-label ext-field-range-label">
        <span>{sub.label}</span>
        <output class="ext-list-range-value">{current}</output>
      </span>
      <input
        class="ext-list-subfield ext-list-range"
        type="range"
        data-subkey={sub.key}
        data-subtype="text"
        min={min}
        max={max}
        step={step}
        value={current}
      />
    </div>
  );
};
