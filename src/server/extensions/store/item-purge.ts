import { ExtensionStoreType } from "../../types/extension";
import { removeSettings } from "../../utils/settings/plugin-settings";
import { forgetShortcutBindings } from "../../utils/settings/shortcuts-settings";
import { purgeEngineRefs } from "../engines/engine-purge";
import { settingsIdsForInstalled } from "./item-specs";

export const purgeItemSettings = async (
  type: ExtensionStoreType,
  installedAs: string,
): Promise<void> => {
  const ids = settingsIdsForInstalled(type, installedAs);
  for (const id of ids) await removeSettings(id);
  if (type === ExtensionStoreType.Engine)
    await purgeEngineRefs([...ids, installedAs.toLowerCase()]);
  if (type === ExtensionStoreType.Shortcut) await forgetShortcutBindings(ids);
};
