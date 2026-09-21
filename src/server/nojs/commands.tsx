import { renderHtml } from "../../shared/ui/core/html";
import { CommandNotice } from "./command-notice";
import { CommandPanel } from "./command-panel";
import type { BangMatch } from "../extensions/commands/registry";
import type { CommandContext, Translate } from "../types";
import { logger } from "../utils/logger";
import { isDisabled } from "../utils/plugin-settings";
import { buildSignedProxyUrl } from "../utils/proxy-sign";
import { syncVortexSignal } from "../utils/translation-circuit";

export type NojsCommandMatch = Extract<BangMatch, { type: "command" }>;

export interface NojsCommandRender {
  html: string;
  totalPages: number;
}

const _panel = (id: string, title: string, body: string): string =>
  renderHtml(<CommandPanel id={id} title={title} bodyHtml={body} />);

const _notice = (id: string, message: string): string =>
  _panel(id, "", renderHtml(<CommandNotice message={message} />));

export const renderNojsCommand = async (
  match: NojsCommandMatch,
  clientIp: string | undefined,
  locale: string,
  t: Translate,
  page: number,
): Promise<NojsCommandRender> => {
  const notice = (key: string): NojsCommandRender => ({
    html: _notice(match.commandId, String(t(key, undefined, locale))),
    totalPages: 1,
  });

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
    return {
      html: _panel(match.commandId, result.title ?? "", html),
      totalPages: result.totalPages && result.totalPages > 0 ? result.totalPages : 1,
    };
  } catch (err) {
    logger.error("nojs", `command ${match.commandId} failed`, err);
    return notice("nojs.command-failed");
  }
};
