import { getBase } from "../../utils/base-url";
import { fetchWizardDone, markServerDone, patchServerWizard } from "./server";
import { HOME_STEPS, SETTINGS_STEPS } from "./steps";
import { isTourActive, runTour } from "./tour";

const HOME_DONE_KEY = "degoog-wizard-home-done";

export const initHomeWizard = async (): Promise<void> => {
  if (isTourActive()) return;
  if (!document.getElementById("search-input")) return;
  if (localStorage.getItem(HOME_DONE_KEY) === "true") return;
  const done = await fetchWizardDone();
  if (done) return;
  await runTour(HOME_STEPS, () => {
    localStorage.setItem(HOME_DONE_KEY, "true");
  });
};

export const restartWizard = (): void => {
  if (isTourActive()) return;
  localStorage.removeItem(HOME_DONE_KEY);
  void patchServerWizard(false).finally(() => {
    window.location.href = `${getBase()}/`;
  });
};

export const initSettingsWizard = async (): Promise<void> => {
  if (isTourActive()) return;
  const done = await fetchWizardDone();
  if (done) return;
  void runTour(SETTINGS_STEPS, () => {
    localStorage.removeItem(HOME_DONE_KEY);
    void markServerDone();
  });
};
