import type {
  SettingField,
  VisibleWhenMatch,
  VisibleWhenRule,
} from "./setting-field";

type FieldValue = string | string[] | boolean | undefined | null;

export const SECRET_SET = "__SET__";

const _isAnyOf = (rule: VisibleWhenRule): rule is { anyOf: VisibleWhenRule[] } =>
  Array.isArray((rule as { anyOf?: unknown }).anyOf);

const _isValidRule = (rule: unknown): rule is VisibleWhenRule => {
  if (!rule || typeof rule !== "object") return false;
  const r = rule as VisibleWhenRule;
  if (_isAnyOf(r)) return r.anyOf.length > 0 && r.anyOf.every(_isValidRule);
  return (
    typeof r.key === "string" &&
    (r.equals !== undefined || r.notEquals !== undefined)
  );
};

export const visibleWhenRules = (field: {
  visibleWhen?: VisibleWhenRule | VisibleWhenRule[];
}): VisibleWhenRule[] => {
  const raw = field.visibleWhen;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter(_isValidRule);
};

const _asString = (value: FieldValue): string => {
  if (value === undefined || value === null) return "";
  return Array.isArray(value) ? value.join("\n") : String(value);
};

const _isBool = (expected: string): boolean =>
  expected === "true" || expected === "false";

const _hits = (
  expected: string | string[] | undefined,
  actual: string,
): boolean => {
  if (expected === undefined) return false;
  const list = Array.isArray(expected) ? expected : [expected];
  return list.some((item) => {
    const want = String(item);
    if (_isBool(want)) return (actual === "true" ? "true" : "false") === want;
    return actual === want;
  });
};

export const ruleMatches = (rule: VisibleWhenMatch, value: FieldValue): boolean => {
  const actual = _asString(value);
  if (rule.equals !== undefined && !_hits(rule.equals, actual)) return false;
  if (rule.notEquals !== undefined && _hits(rule.notEquals, actual)) return false;
  return true;
};

export const evaluateRule = (
  rule: VisibleWhenRule,
  read: (key: string) => FieldValue,
  shown: (key: string) => boolean,
): boolean => {
  if (_isAnyOf(rule)) return rule.anyOf.some((sub) => evaluateRule(sub, read, shown));
  return shown(rule.key) && ruleMatches(rule, read(rule.key));
};

export const isFieldVisible = (
  field: SettingField,
  schema: SettingField[],
  values: Record<string, FieldValue>,
  seen: Set<string> = new Set(),
): boolean => {
  const rules = visibleWhenRules(field);
  if (rules.length === 0) return true;
  if (seen.has(field.key)) return false;
  const next = new Set(seen).add(field.key);
  const depOf = (key: string): SettingField | undefined =>
    schema.find((f) => f.key === key);
  const read = (key: string): FieldValue => {
    const stored = values[key];
    if (stored !== undefined && stored !== null) return stored;
    const def = depOf(key)?.default;
    return def !== undefined && def !== null ? String(def) : "";
  };
  const shown = (key: string): boolean => {
    const dep = depOf(key);
    return dep ? isFieldVisible(dep, schema, values, next) : true;
  };
  return rules.every((rule) => evaluateRule(rule, read, shown));
};
