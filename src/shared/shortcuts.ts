export type ShortcutBinding = {
  key?: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
};

export type ShortcutKind = "single" | "numeric";

export type ShortcutActionMeta = {
  id: string;
  kind: ShortcutKind;
  defaultBinding: ShortcutBinding;
  displayName?: string;
  description?: string;
  source?: "builtin" | "plugin";
  editable?: boolean;
  disabled?: boolean;
};

export type ClientShortcut = ShortcutActionMeta & {
  moduleUrl: string;
};

export type ShortcutsConfig = {
  bindings: Record<string, ShortcutBinding>;
  custom: ClientShortcut[];
};

export const SHORTCUT_ACTIONS: ShortcutActionMeta[] = [
  { id: "focus-search", kind: "single", defaultBinding: { key: "/" } },
];
export const MODIFIER_KEYS = ["ctrl", "meta", "alt", "shift"] as const;
const BINDING_KEYS = new Set(["key", ...MODIFIER_KEYS]);

const _hasModifier = (binding: ShortcutBinding): boolean =>
  Boolean(binding.ctrl || binding.meta || binding.alt || binding.shift);

const _normalizeBinding = (
  action: ShortcutActionMeta,
  value: unknown,
): ShortcutBinding | null => {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !BINDING_KEYS.has(key))) return null;
  if ("key" in record && typeof record.key !== "string") return null;
  for (const mod of MODIFIER_KEYS) {
    if (mod in record && typeof record[mod] !== "boolean") return null;
  }
  const binding: ShortcutBinding = {};
  if (typeof record.key === "string") binding.key = record.key;
  for (const mod of MODIFIER_KEYS) {
    if (typeof record[mod] === "boolean") binding[mod] = record[mod];
  }
  if (action.kind === "numeric") {
    delete binding.key;
    return _hasModifier(binding) ? binding : null;
  }
  return binding.key ? binding : null;
};

export const parseShortcutsMap = (
  value: unknown,
  actions: ShortcutActionMeta[] = SHORTCUT_ACTIONS,
): Record<string, ShortcutBinding> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const actionById = new Map(actions.map((a) => [a.id, a]));
  const result: Record<string, ShortcutBinding> = {};
  for (const [id, binding] of Object.entries(value)) {
    const action = actionById.get(id);
    if (!action) return null;
    const normalized = _normalizeBinding(action, binding);
    if (!normalized) return null;
    result[id] = normalized;
  }
  return result;
};
