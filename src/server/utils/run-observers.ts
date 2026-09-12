import { getInterceptors } from "../extensions/interceptors/registry";
import { logger } from "./logger";
import { isDisabled } from "./plugin-settings";
import type { EngineRunReport, QueryInterceptor } from "../types/extension";

const _notify = async (
  observers: QueryInterceptor[],
  report: EngineRunReport,
): Promise<void> => {
  for (const observer of observers) {
    const sid = observer.settingsId;
    if (sid && (await isDisabled(sid))) continue;

    try {
      await observer.observe?.(report);
    } catch (err) {
      logger.debug("interceptors", `${observer.name} observe threw`, err);
    }
  }
};

export const reportEngineRun = (report: EngineRunReport): void => {
  const observers = getInterceptors().filter(
    (i) => typeof i.observe === "function",
  );
  if (observers.length === 0) return;

  void _notify(observers, report).catch((err) => {
    logger.debug("interceptors", "observer dispatch failed", err);
  });
};
