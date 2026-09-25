import {
  type ExtensionMeta,
  ExtensionStoreType,
  type Translate,
} from "../../types/extension";
import type { SettingField } from "../../../shared/setting-field";
import {
  asBoolean,
  getSettings,
  getTypeOverride,
  maskSecrets,
} from "../../utils/settings/plugin-settings";
import { transportPicks } from "../transports/registry";
import { extensionReadmeExists } from "../../utils/extension-support/extension-docs";
import { getInstanceSettings } from "../../utils/settings/server-settings";
import { DEGOOG_ENGINE_ID } from "./builtins/degoog";
import {
  isExtensionRestartFlagVisible,
} from "../../utils/extension-support/restart-state";
import { manifestKeys } from "./entries";
import { translateSchema } from "../extension-meta";
import { allEngineEntries } from "./loader";
import { getDefaultEngineConfig, getEngineMap } from "./catalog";
import { resolveTypes } from "./search-types";
import { primaryType } from "../../../shared/search-types";
import {
  CUSTOM_USER_AGENTS_FIELD,
  OUTGOING_TRANSPORT_FIELD,
  PROXY_OVERRIDE_ENABLED_FIELD,
  PROXY_OVERRIDE_URLS_FIELD,
  SCORE_FIELD,
  TIMEOUT_FIELD,
} from "./setting-fields";

export const getEngineExtensionMeta = async (
  coreT?: Translate,
): Promise<ExtensionMeta[]> => {
  const items = allEngineEntries();
  const engineMap = getEngineMap();
  const results: ExtensionMeta[] = [];
  const { names: transportOptions, labels: transportLabels } =
    await transportPicks();

  const baseScoreField = coreT
    ? {
        ...SCORE_FIELD,
        label: coreT("settings-page.schema.score.label") || SCORE_FIELD.label,
        description:
          coreT("settings-page.schema.score.description") ||
          SCORE_FIELD.description,
      }
    : SCORE_FIELD;

  const baseTransportField = coreT
    ? {
        ...OUTGOING_TRANSPORT_FIELD,
        label:
          coreT("settings-page.schema.outgoing-transport.label") ||
          OUTGOING_TRANSPORT_FIELD.label,
        description:
          coreT("settings-page.schema.outgoing-transport.description") ||
          OUTGOING_TRANSPORT_FIELD.description,
      }
    : OUTGOING_TRANSPORT_FIELD;

  const timeoutField = coreT
    ? {
        ...TIMEOUT_FIELD,
        label:
          coreT("settings-page.schema.timeout.label") || TIMEOUT_FIELD.label,
        description:
          coreT("settings-page.schema.timeout.description") ||
          TIMEOUT_FIELD.description,
      }
    : TIMEOUT_FIELD;

  const settings = await getInstanceSettings();
  const indexerOn = asBoolean(settings.degoogIndexerEnabled);

  const defaults = getDefaultEngineConfig();
  for (const entry of items) {
    if (entry.id === DEGOOG_ENGINE_ID && !indexerOn) continue;
    const instance = engineMap[entry.id];
    const engineSchema = instance?.settingsSchema ?? [];

    const engineTransportField = engineSchema.find(
      (f) => f.key === "outgoingTransport",
    );
    const engineScoreField = engineSchema.find((f) => f.key === "score");

    const transportDefault =
      engineTransportField?.default ?? OUTGOING_TRANSPORT_FIELD.default;

    const transportField: SettingField = {
      ...baseTransportField,
      options: transportOptions,
      optionLabels: transportLabels,
      default: transportDefault,
    };

    const scoreField: SettingField = engineScoreField
      ? {
          ...baseScoreField,
          default: engineScoreField.default ?? baseScoreField.default,
        }
      : baseScoreField;

    const pluginT = entry.instance.t;
    const sharedKeys = manifestKeys(entry);
    const engineSchemaFiltered = engineSchema.filter(
      (f) =>
        f.key !== "outgoingTransport" &&
        f.key !== "score" &&
        f.key !== "searchTypeOverride" &&
        !sharedKeys.has(f.key),
    );
    const translatedEngineSchema = translateSchema(entry.id, engineSchemaFiltered, pluginT);

    const override = await getTypeOverride(entry.id);
    const effectiveTypes = resolveTypes(entry.searchTypes, override);
    const typesDisplay = entry.searchTypes.join(",");
    const typeOverrideField: SettingField = {
      key: "searchTypeOverride",
      label: "Engine type override",
      type: "text",
      default: typesDisplay,
      description:
        "Override which tabs this engine runs in. Use a single type (e.g. images) or comma-separated for multiple (e.g. web,keywords). Leave blank to use the default.",
      advanced: true,
      placeholder: typesDisplay,
    };

    const schema: SettingField[] = [
      scoreField,
      transportField,
      timeoutField,
      CUSTOM_USER_AGENTS_FIELD,
      PROXY_OVERRIDE_ENABLED_FIELD,
      PROXY_OVERRIDE_URLS_FIELD,
      typeOverrideField,
      ...translatedEngineSchema,
    ];
    const rawSettings = await getSettings(entry.id);
    const maskedSettings = maskSecrets(rawSettings, schema);
    const { exists } = await extensionReadmeExists(entry.id);

    results.push({
      id: entry.id,
      displayName: entry.displayName,
      description: entry.description ?? "",
      primaryType: primaryType(effectiveTypes),
      searchTypes: effectiveTypes,
      type: ExtensionStoreType.Engine,
      configurable: true,
      settingsSchema: schema,
      settings: maskedSettings,
      extensionDocsAvailable: exists,
      defaultEnabled: defaults[entry.id],
      source: entry.source,
      compatibilityLayer: entry.compatibilityLayer,
      needsAppRestart: isExtensionRestartFlagVisible(instance?.needsAppRestart),
    });
  }

  return results;
};
