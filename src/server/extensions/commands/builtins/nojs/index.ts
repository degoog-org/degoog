import {
  TranslateFunction,
  type BangCommand,
  type CommandContext,
  type CommandResult,
} from "../../../../types";
import { getBasePath, getBaseUrl } from "../../../../utils/base-url";
import { isNojsEnabled } from "../../../../nojs/settings";
import { NOJS_SEGMENT } from "../../../../nojs/links";
import { escapeHtml } from "../../../../utils/text";

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
        html: `<div class="command-result command-nojs"><p>${this.t!("nojs.disabled")}</p></div>`,
      };
    }

    const url = _target(args);
    const href = escapeHtml(url);
    const linkLabel = args.trim()
      ? this.t!("nojs.search-link", { query: args.trim() })
      : this.t!("nojs.open-link");
    const link = `<p><a class="degoog-link" href="${href}">${escapeHtml(String(linkLabel))}</a></p>`;

    if (context?.nojs) {
      return {
        title: this.t!("nojs.title"),
        html: `<div class="command-result command-nojs">${link}</div>`,
      };
    }

    const redirect = `<script>(function(){window.location.href=${JSON.stringify(url).replace(/</g, "\\u003c")};})();<\/script>`;
    return {
      title: this.t!("nojs.title"),
      html: `<div class="command-result command-nojs"><p>${this.t!("nojs.redirecting")}</p>${link}</div>${redirect}`,
    };
  },
};

export default nojsCommand;
