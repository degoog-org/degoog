import type { BangMatch } from "../extensions/commands/registry";
import type { CommandContext, Translate } from "../types";
import { logger } from "../utils/logger";
import { isDisabled } from "../utils/plugin-settings";
import { buildSignedProxyUrl } from "../utils/proxy-sign";
import { syncVortexSignal } from "../utils/translation-circuit";
import { escapeAttribute } from "./template";

const PANEL_CLASS =
  "nojs-command results-slot-panel degoog-panel degoog-panel--slot degoog-panel--stack-item";
const PANEL_TITLE_CLASS = "results-slot-panel-title degoog-panel--slot-title";
const PANEL_BODY_CLASS =
  "results-slot-panel-body degoog-panel--slot-body degoog-panel--slot-body-padded";

export type NojsCommandMatch = Extract<BangMatch, { type: "command" }>;

const _panel = (id: string, title: string, body: string): string =>
  `<div class="${PANEL_CLASS}" data-command="${escapeAttribute(id)}">` +
  (title ? `<div class="${PANEL_TITLE_CLASS}">${escapeAttribute(title)}</div>` : "") +
  `<div class="${PANEL_BODY_CLASS}">${body}</div>` +
  "</div>";

const _notice = (id: string, message: string): string =>
  _panel(id, "", `<p class="nojs-command-notice">${message}</p>`);

export const renderNojsCommand = async (
  match: NojsCommandMatch,
  clientIp: string | undefined,
  locale: string,
  t: Translate,
  page: number,
): Promise<string> => {
  const notice = (key: string): string =>
    _notice(match.commandId, String(t(key, undefined, locale)));

  if (await isDisabled(match.commandId)) {
    return notice("nojs.command-disabled");
  }
  if (match.command.supportsNojs !== true) {
    return notice("nojs.command-unsupported");
  }

  const context: CommandContext = {
    clientIp,
    page,
    signProxyUrl: buildSignedProxyUrl,
    nojs: true,
  };
  try {
    const t0 = performance.now();
    const result = await match.command.execute(match.args, context);
    logger.debug(
      "plugin",
      `${match.command.trigger} executed in ${Math.round(performance.now() - t0)}ms for nojs`,
    );
    const html = match.command.t
      ? syncVortexSignal(result.html, match.command.t, locale)
      : result.html;
    return _panel(match.commandId, result.title ?? "", html);
  } catch (err) {
    logger.error("nojs", `command ${match.commandId} failed`, err);
    return notice("nojs.command-failed");
  }
};
