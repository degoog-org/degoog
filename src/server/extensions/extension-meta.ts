import type { ExtensionMeta, Translate } from "../types/extension";
import type { SettingField } from "../../shared/setting-field";
import { maskSecrets, type SettingValue } from "../utils/settings/plugin-settings";
import { extensionReadmeExists } from "../utils/extension-support/extension-docs";

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

export const translateSchema = (
  id: string,
  schema: SettingField[],
  t: Translate | undefined,
): SettingField[] =>
  t
    ? schema.map((field) => {
        const base = `${id}.settings.${field.key}`;
        const label = t(`${base}.label`);
        const desc =
          field.description !== undefined
            ? t(`${base}.description`)
            : undefined;
        const placeholder =
          field.placeholder !== undefined
            ? t(`${base}.placeholder`)
            : undefined;
        return {
          ...field,
          label: label !== `${base}.label` ? label : field.label,
          ...(desc !== undefined && desc !== `${base}.description`
            ? { description: desc }
            : {}),
          ...(placeholder !== undefined &&
          placeholder !== `${base}.placeholder`
            ? { placeholder }
            : {}),
        };
      })
    : schema;
