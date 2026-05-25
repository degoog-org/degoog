import { ExtensionStoreType } from "../../types";
import {
  pluginsDir,
  themesDir,
  enginesDir,
  transportsDir,
  autocompleteDir,
} from "../../utils/paths";
import { getPluginSettingsIds } from "../../utils/plugin-assets";
import { makeExtID } from "../extension-id";
import { reloadCommands } from "../commands/registry";
import { reloadSlotPlugins } from "../slots/registry";
import { reloadInterceptors } from "../interceptors/registry";
import { reloadSearchResultTabs } from "../search-result-tabs/registry";
import { reloadSearchBarActions } from "../search-bar/registry";
import { reloadPluginRoutes } from "../plugin-routes/registry";
import { reloadMiddlewareRegistry } from "../middleware/registry";
import { reloadThemes } from "../themes/registry";
import { reloadEngines } from "../engines/registry";
import { reloadTransports } from "../transports/registry";
import { reloadAutocomplete } from "../autocomplete/registry";

type ManifestKey =
  | "plugins"
  | "themes"
  | "engines"
  | "transports"
  | "autocomplete";

interface StoreTypeSpec {
  destDir: () => string;
  manifestKey: ManifestKey;
  reload: (bust: boolean) => Promise<void>;
  settingsIds: (installedAs: string) => string[];
}

const reloadPluginBundle = async (bust: boolean): Promise<void> => {
  await reloadSlotPlugins(bust);
  await reloadInterceptors(bust);
  await reloadSearchResultTabs(bust);
  await reloadCommands(bust);
  await reloadSearchBarActions(bust);
  await reloadPluginRoutes(bust);
  await reloadMiddlewareRegistry(bust);
};

const pluginSettingsIds = (installedAs: string): string[] => {
  const ids = new Set<string>(getPluginSettingsIds(installedAs));
  ids.add(`plugin-${installedAs}`);
  return [...ids];
};

export const STORE_TYPE_SPECS: Record<ExtensionStoreType, StoreTypeSpec> = {
  [ExtensionStoreType.Plugin]: {
    destDir: pluginsDir,
    manifestKey: "plugins",
    reload: reloadPluginBundle,
    settingsIds: pluginSettingsIds,
  },
  [ExtensionStoreType.Theme]: {
    destDir: themesDir,
    manifestKey: "themes",
    reload: () => reloadThemes(),
    settingsIds: (id) => [`theme-${makeExtID(id, "theme")}`],
  },
  [ExtensionStoreType.Engine]: {
    destDir: enginesDir,
    manifestKey: "engines",
    reload: () => reloadEngines(),
    settingsIds: (id) => [makeExtID(id, "engine")],
  },
  [ExtensionStoreType.Transport]: {
    destDir: transportsDir,
    manifestKey: "transports",
    reload: () => reloadTransports(),
    settingsIds: (id) => [`transport-${makeExtID(id, "transport")}`],
  },
  [ExtensionStoreType.Autocomplete]: {
    destDir: autocompleteDir,
    manifestKey: "autocomplete",
    reload: () => reloadAutocomplete(),
    settingsIds: (id) => [`autocomplete-${id}`],
  },
};
