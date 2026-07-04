import { getBase } from "../../utils/base-url";
import { fetchWizardDone, markServerDone, patchServerWizard } from "./server";
import { HOME_STEPS, SETTINGS_STEPS } from "./steps";
import { isTourActive, runTour } from "./tour";

const HOME_DONE_KEY = "degoog-wizard-home-done";
const MANUAL_RESTART_KEY = "degoog-wizard-manual-restart";
const SETTINGS_PENDING_KEY = "degoog-wizard-settings-pending";

const runHomeTour = (): Promise<void> =>
  runTour(
    HOME_STEPS,
    () => {
      localStorage.setItem(HOME_DONE_KEY, "true");
    },
    () => {
      sessionStorage.removeItem(SETTINGS_PENDING_KEY);
    },
  );

export const initHomeWizard = async (): Promise<void> => {
  if (isTourActive()) return;
  if (!document.getElementById("search-input")) return;

  const manualRestart = sessionStorage.getItem(MANUAL_RESTART_KEY) === "true";
  if (manualRestart) {
    sessionStorage.removeItem(MANUAL_RESTART_KEY);
    await runHomeTour();
    return;
  }

  if (localStorage.getItem(HOME_DONE_KEY) === "true") return;
  const done = await fetchWizardDone();
  if (done) return;
  await runHomeTour();
};

export const restartWizard = async (): Promise<void> => {
  if (isTourActive()) return;
  sessionStorage.setItem(MANUAL_RESTART_KEY, "true");
  sessionStorage.setItem(SETTINGS_PENDING_KEY, "true");
  localStorage.removeItem(HOME_DONE_KEY);
  await patchServerWizard(false);
  window.location.href = `${getBase()}/`;
};

export const initSettingsWizard = async (): Promise<void> => {
  if (isTourActive()) return;
  const manualRestart = sessionStorage.getItem(SETTINGS_PENDING_KEY) === "true";
  if (!manualRestart) {
    const done = await fetchWizardDone();
    if (done) return;
  }
  sessionStorage.removeItem(SETTINGS_PENDING_KEY);
  void runTour(SETTINGS_STEPS, () => {
    localStorage.setItem(HOME_DONE_KEY, "true");
    void markServerDone();
  });
};
