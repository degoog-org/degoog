import {
  TranslateFunction,
  type BangCommand,
  type CommandContext,
  type CommandResult,
} from "../../../../types";
import { outgoingFetch } from "../../../../utils/outgoing";

export const ipCommand: BangCommand = {
  name: "IP Lookup",
  get description(): string {
    return this.t!("ip.description");
  },
  trigger: "ip",
  naturalLanguagePhrases: ["what's my ip", "my ip"],

  t: TranslateFunction,

  async execute(
    args: string,
    context?: CommandContext,
  ): Promise<CommandResult> {
    const raw = args.trim() || context?.clientIp || "";
    const ip = raw.replace(/^::ffff:/, "");
    if (
      !ip ||
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip === "localhost" ||
      /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(ip)
    ) {
      const detecting = this.t!("ip.detecting");
      const detectFailed = this.t!("ip.detect-failed");
      const detectFailedHint = this.t!("ip.detect-failed-hint");
      const detectHtml = `<div id="ip-detect-root"><p>${detecting}</p></div><script>(function(){var c=document.getElementById('ip-detect-root');if(!c)return;fetch('https://api.ipify.org?format=json').then(function(r){return r.json();}).then(function(d){return fetch('/api/command?q='+encodeURIComponent('!ip '+d.ip));}).then(function(r){return r.json();}).then(function(d){if(d&&d.html)c.innerHTML=d.html;else c.innerHTML='<p>${detectFailed}</p>';}).catch(function(){c.innerHTML='<p>${detectFailedHint}</p>';});})();<\/script>`;
      return {
        title: this.t!("ip.title"),
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
          title: this.t!("ip.title"),
          html: `<div><p>${this.t!("ip.lookup-failed", { message: data.message })}</p></div>`,
        };
      }
      const na = this.t!("ip.na");
      const fields = [
        [this.t!("ip.label-ip"), data.query],
        [this.t!("ip.label-city"), data.city],
        [this.t!("ip.label-region"), data.regionName],
        [this.t!("ip.label-country"), data.country],
        [this.t!("ip.label-isp"), data.isp],
        [this.t!("ip.label-org"), data.org],
        [this.t!("ip.label-latlon"), `${data.lat}, ${data.lon}`],
      ];
      const rows = fields
        .map(
          ([k, v]) =>
            `<div class="ip-row"><span class="ip-label">${k}</span><span class="ip-value">${v || na}</span></div>`,
        )
        .join("");
      return {
        title: this.t!("ip.title-result", { ip: data.query }),
        html: `<div class="command-ip-info">${rows}</div>`,
      };
    } catch {
      return {
        title: this.t!("ip.title"),
        html: `<div><p>${this.t!("ip.fetch-failed")}</p></div>`,
      };
    }
  },
};

export default ipCommand;
