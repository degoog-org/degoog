import { asBoolean } from "../utils/plugin-settings";
import { getInstanceSettings } from "../utils/server-settings";

export const isNojsEnabled = async (): Promise<boolean> => {
  const settings = await getInstanceSettings();
  return asBoolean(settings.nojsEnabled);
};

export const isNojsCssCheckOn = async (): Promise<boolean> => {
  const settings = await getInstanceSettings();
  return asBoolean(settings.nojsCssCheck);
};
