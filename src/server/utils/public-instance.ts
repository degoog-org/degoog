export const isPublicInstance = (): boolean => {
  const v = process.env.DEGOOG_PUBLIC_INSTANCE ?? "";
  const t = v.trim().toLowerCase();
  return t === "true" || t === "1";
};

export const getAdminPath = (): string => {
  const custom = (process.env.DEGOOG_SETTINGS_PATH ?? "")
    .trim()
    .replace(/^\/+/, "");
  if (custom) return custom;
  return isPublicInstance() ? "admin" : "settings";
};
