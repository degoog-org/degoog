import { join } from "path";

const _dataDir = (): string =>
  process.env.DEGOOG_DATA_DIR ?? join(process.cwd(), "data");

export const pluginsDir = (): string =>
  process.env.DEGOOG_PLUGINS_DIR ?? join(_dataDir(), "plugins");

export const enginesDir = (): string =>
  process.env.DEGOOG_ENGINES_DIR ?? join(_dataDir(), "engines");

export const themesDir = (): string =>
  process.env.DEGOOG_THEMES_DIR ?? join(_dataDir(), "themes");

export const transportsDir = (): string =>
  process.env.DEGOOG_TRANSPORTS_DIR ?? join(_dataDir(), "transports");

export const aliasesFile = (): string =>
  process.env.DEGOOG_ALIASES_FILE ?? join(_dataDir(), "aliases.json");

export const pluginSettingsFile = (): string =>
  process.env.DEGOOG_PLUGIN_SETTINGS_FILE ?? join(_dataDir(), "plugin-settings.json");

export const defaultEnginesFile = (): string =>
  process.env.DEGOOG_DEFAULT_ENGINES_FILE ?? join(_dataDir(), "default-engines.json");
