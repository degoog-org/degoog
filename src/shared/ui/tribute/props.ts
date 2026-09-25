export const SKIPPED_PROPS = new Set(["key", "static", "children"]);

export const isEventProp = (name: string): boolean =>
  name.length > 2 && name.startsWith("on") && name[2] === name[2].toUpperCase();
