import {
  type BangCommand,
  type CommandContext,
  type CommandResult,
  TranslateFunction,
} from "../../../../types/extension";
import { getBaseUrl } from "../../../../utils/net/base-url";
import { outgoingFetch } from "../../../../utils/net/outgoing";
import { logger } from "../../../../utils/logger";
import { renderDetectRoot, renderInfo, renderMessage } from "./render";

const _toScriptString = (value: string): string =>
  JSON.stringify(value).replace(/</g, "\\u003c");

export const ipCommand: BangCommand = {
  name: "IP Lookup",
  get description(): string {
    return this.t!("ip.description");
  },
  trigger: "ip",
  naturalLanguagePhrases: ["what's my ip", "my ip"],
  supportsNojs: true,
  respectRateLimiting: true,
  isClientExposed: true,

  t: TranslateFunction,

  async execute(
    args: string,
    context?: CommandContext,
  ): Promise<CommandResult> {
    const locale = context?.locale;
    const raw = args.trim() || context?.clientIp || "";
    const ip = raw.replace(/^::ffff:/, "");
    if (
      !ip ||
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip === "localhost" ||
      /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(ip)
    ) {
      const detectFailedHint = this.t!("ip.detect-failed-hint", undefined, locale);
      if (context?.nojs) {
        return {
          title: this.t!("ip.title", undefined, locale),
          html: renderDetectRoot(detectFailedHint),
        };
      }
      const detecting = this.t!("ip.detecting", undefined, locale);
      const detectFailed = this.t!("ip.detect-failed", undefined, locale);
      const detectHtml = `${renderDetectRoot(detecting)}<script>(function(){var c=document.getElementById('ip-detect-root');if(!c)return;fetch('https://api.ipify.org?format=json').then(function(r){return r.json();}).then(function(d){return fetch('${getBaseUrl()}/api/command?q='+encodeURIComponent('!ip '+d.ip));}).then(function(r){return r.json();}).then(function(d){if(d&&d.html)c.innerHTML=d.html;else c.innerHTML='<p>'+${_toScriptString(detectFailed)}+'</p>';}).catch(function(){c.innerHTML='<p>'+${_toScriptString(detectFailedHint)}+'</p>';});})();<\/script>`;
      return {
        title: this.t!("ip.title", undefined, locale),
        html: detectHtml,
      };
    }
    try {
      const res = await outgoingFetch(
        `http://ip-api.com/json/${encodeURIComponent(ip)}`,
      );
      const data = await res.json();
      if (data.status === "fail") {
        return {
          title: this.t!("ip.title", undefined, locale),
          html: renderMessage(this.t!("ip.lookup-failed", { message: data.message }, locale)),
        };
      }
      const na = this.t!("ip.na", undefined, locale);
      const fields = [
        [this.t!("ip.label-ip", undefined, locale), data.query],
        [this.t!("ip.label-city", undefined, locale), data.city],
        [this.t!("ip.label-region", undefined, locale), data.regionName],
        [this.t!("ip.label-country", undefined, locale), data.country],
        [this.t!("ip.label-isp", undefined, locale), data.isp],
        [this.t!("ip.label-org", undefined, locale), data.org],
        [this.t!("ip.label-latlon", undefined, locale), `${data.lat}, ${data.lon}`],
      ];
      return {
        title: this.t!("ip.title-result", { ip: data.query }, locale),
        html: renderInfo(
          fields.map(([k, v]) => [String(k), String(v || na)] as [string, string]),
        ),
      };
    } catch (err) {
      logger.warn("commands:ip", `lookup failed for ${ip}`, err);
      return {
        title: this.t!("ip.title", undefined, locale),
        html: renderMessage(this.t!("ip.fetch-failed", undefined, locale)),
      };
    }
  },
};

export default ipCommand;
