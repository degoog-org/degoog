import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROUTE_MODULE_PATHS: Record<string, string> = {
  commands: "extensions/commands",
  "compat-engines": "extensions/compat-engines",
  extensions: "extensions/extensions",
  honeypot: "security/honeypot",
  pages: "pages/pages",
  "privacy-policy": "settings/privacy-policy",
  "plugin-assets": "extensions/plugin-assets",
  "plugin-routes": "extensions/plugin-routes",
  "rate-limit": "security/rate-limit",
  "search-bar": "search/search-bar",
  settings: "settings/settings",
  "settings-auth": "settings/settings-auth",
  "settings-backup": "settings/settings-backup",
  setup: "settings/setup",
  shortcuts: "extensions/shortcuts",
  slots: "search/slots",
  store: "extensions/store",
  suggest: "search/suggest",
  teapot: "easter-eggs/teapot",
  themes: "extensions/themes",
  uovadipasqua: "easter-eggs/uovadipasqua",
};

export const routeModulePath = (name: string): string => ROUTE_MODULE_PATHS[name] ?? name;

export const ISOLATED_ROUTE_ENV = [
  "DEGOOG_DATA_DIR",
  "DEGOOG_SERVER_SETTINGS_FILE",
  "DEGOOG_INDEXER_DIR",
  "DEGOOG_PLUGIN_SETTINGS_FILE",
  "DEGOOG_PUBLIC_INSTANCE",
  "DEGOOG_SETTINGS_PASSWORDS",
  "DEGOOG_DANGEROUSLY_NO_PASSWORD",
  "DEGOOG_SETTINGS_PATH",
  "DEGOOG_BASE_URL",
] as const;

export const isolateRouteEnv = (prefix: string, overrides: Record<string, string> = {}): (() => void) => {
  const saved = ISOLATED_ROUTE_ENV.map((key) => [key, process.env[key]] as const);
  for (const key of ISOLATED_ROUTE_ENV) delete process.env[key];
  process.env.DEGOOG_DATA_DIR = mkdtempSync(join(tmpdir(), prefix));
  Object.assign(process.env, overrides);
  return () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
};
