const themeT = window.scopedT("themes/degoog");

export const typeLabel = (type: string): string => {
  const translated = themeT(`search-templates.tabs.${type}`);
  return translated !== `search-templates.tabs.${type}`
    ? translated
    : type.charAt(0).toUpperCase() + type.slice(1);
};
