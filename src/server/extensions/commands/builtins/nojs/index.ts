import {
  renderNojsLinkPanel,
  renderNojsMessage,
  renderNojsRedirectPanel,
} from "./render";
import {
  TranslateFunction,
  type BangCommand,
  type CommandContext,
  type CommandResult,
} from "../../../../types";
import { getBasePath, getBaseUrl } from "../../../../utils/base-url";
import { isNojsEnabled } from "../../../../nojs/settings";
import { NOJS_SEGMENT } from "../../../../nojs/links";

const _root = (): string => {
  const base = getBaseUrl() || getBasePath();
  return `${base}${NOJS_SEGMENT}`;
};

const _target = (args: string): string => {
  const query = args.trim();
  if (!query) return _root();
  return `${_root()}/search?q=${encodeURIComponent(query)}`;
};

export const nojsCommand: BangCommand = {
  name: "No-JS page",
  isClientExposed: false,
  get description(): string {
    return this.t!("nojs.description");
  },
  trigger: "nojs",
  aliases: ["no-js", "nojavascript"],
  naturalLanguagePhrases: ["no js", "no javascript", "javascript free search"],
  supportsNojs: true,
  hideWhenUnconfigured: true,

  t: TranslateFunction,

  async isConfigured(): Promise<boolean> {
    return isNojsEnabled();
  },

  async execute(
    args: string,
    context?: CommandContext,
  ): Promise<CommandResult> {
    if (!(await isNojsEnabled())) {
      return {
        title: this.t!("nojs.title"),
        html: renderNojsMessage(String(this.t!("nojs.disabled"))),
      };
    }

    const url = _target(args);
    const linkLabel = args.trim()
      ? this.t!("nojs.search-link", { query: args.trim() })
      : this.t!("nojs.open-link");
    if (context?.nojs) {
      return {
        title: this.t!("nojs.title"),
        html: renderNojsLinkPanel(url, String(linkLabel)),
      };
    }

    const redirect = `<script>(function(){window.location.href=${JSON.stringify(url).replace(/</g, "\\u003c")};})();<\/script>`;
    return {
      title: this.t!("nojs.title"),
      html: `${renderNojsRedirectPanel(String(this.t!("nojs.redirecting")), url, String(linkLabel))}${redirect}`,
    };
  },
};

export default nojsCommand;
