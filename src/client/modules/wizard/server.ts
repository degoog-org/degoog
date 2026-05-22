import { getBase } from "../../utils/base-url";
import { getStoredToken } from "../settings/settings";

const SERVER_SETTINGS_URL = "/api/server-settings";

interface ServerSettingsResponse {
  wizard: boolean;
}

export const fetchWizardDone = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${getBase()}${SERVER_SETTINGS_URL}`);
    if (!res.ok) return true;
    const data = (await res.json()) as ServerSettingsResponse;
    return data.wizard === true;
  } catch (err) {
    console.warn("[wizard] failed to read server-settings", err);
    return true;
  }
};

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
