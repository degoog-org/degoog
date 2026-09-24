import { getBase } from "../../utils/base-url";
import { getStoredToken } from "../settings/settings";

const SERVER_SETTINGS_URL = "/api/server-settings";

interface ServerSettingsResponse {
  wizard: boolean;
  disabled?: boolean;
}

const _readServerWizard = async (): Promise<ServerSettingsResponse | null> => {
  try {
    const res = await fetch(`${getBase()}${SERVER_SETTINGS_URL}`);
    if (!res.ok) return null;
    return (await res.json()) as ServerSettingsResponse;
  } catch (err) {
    console.warn("[wizard] failed to read server-settings", err);
    return null;
  }
};

export const fetchWizardDone = async (): Promise<boolean> => {
  const data = await _readServerWizard();
  return data ? data.wizard === true : true;
};

export const fetchWizardDisabled = async (): Promise<boolean> =>
  (await _readServerWizard())?.disabled === true;

export const patchServerWizard = async (wizard: boolean): Promise<void> => {
  const token = getStoredToken();
  try {
    await fetch(`${getBase()}${SERVER_SETTINGS_URL}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-settings-token": token } : {}),
      },
      body: JSON.stringify({ wizard }),
    });
  } catch (err) {
    console.warn("[wizard] failed to update wizard flag", err);
  }
};

export const markServerDone = (): void => {
  void patchServerWizard(true);
};
