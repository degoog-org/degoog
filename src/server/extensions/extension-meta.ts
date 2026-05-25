import type { ExtensionMeta, SettingField } from "../types";
import { maskSecrets, type SettingValue } from "../utils/plugin-settings";
import { extensionReadmeExists } from "../utils/extension-docs";

interface BuildMetaInput {
  id: string;
  displayName: string;
  description: string;
  type: ExtensionMeta["type"];
  schema: SettingField[];
  rawSettings: Record<string, SettingValue>;
  checkDocs?: boolean;
  extra?: Partial<ExtensionMeta>;
}

export const buildExtensionMeta = async (
  input: BuildMetaInput,
): Promise<ExtensionMeta> => {
  const { id, schema, rawSettings, checkDocs = true } = input;
  const settings = maskSecrets(rawSettings, schema);
  if (rawSettings["disabled"]) settings["disabled"] = rawSettings["disabled"];
  const meta: ExtensionMeta = {
    id,
    displayName: input.displayName,
    description: input.description,
    type: input.type,
    configurable: schema.length > 0,
    settingsSchema: schema,
    settings,
    ...input.extra,
  };
  if (checkDocs) {
    const { exists } = await extensionReadmeExists(id);
    meta.extensionDocsAvailable = exists;
  }
  return meta;
};
