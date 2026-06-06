const t = window.scopedT("core");

export const tr = (key: string, vars?: Record<string, string>): string =>
  t(`settings-page.indexer.${key}`, vars);
