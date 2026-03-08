import type { BangCommand, CommandResult, CommandContext } from "../../../types";

export const ipCommand: BangCommand = {
  name: "IP Lookup",
  description: "Look up IP geolocation info (optionally specify an IP)",
  trigger: "ip",
  naturalLanguagePhrases: ["what's my ip", "my ip"],
  async execute(args: string, context?: CommandContext): Promise<CommandResult> {
    let raw = args.trim() || context?.clientIp || "";
    const ip = raw.replace(/^::ffff:/, "");
    if (!ip || ip === "127.0.0.1" || ip === "::1" || ip === "localhost" || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(ip)) {
      const detectHtml = `<div id="ip-detect-root" class="command-result"><p>Detecting your IP...</p></div><script>(function(){var c=document.getElementById('ip-detect-root');if(!c)return;fetch('https://api.ipify.org?format=json').then(function(r){return r.json();}).then(function(d){return fetch('/api/command?q='+encodeURIComponent('!ip '+d.ip));}).then(function(r){return r.json();}).then(function(d){if(d&&d.html)c.innerHTML=d.html;else c.innerHTML='<p>Could not detect IP.</p>';}).catch(function(){c.innerHTML='<p>Could not detect your public IP. Try <strong>!ip 8.8.8.8</strong></p>';});})();<\/script>`;
      return {
        title: "IP Lookup",
        html: detectHtml,
      };
    }
    try {
      const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}`);
      const data = await res.json();
      if (data.status === "fail") {
        return {
          title: "IP Lookup",
          html: `<div class="command-result"><p>Lookup failed: ${data.message}</p></div>`,
        };
      }
      const fields = [
        ["IP", data.query],
        ["City", data.city],
        ["Region", data.regionName],
        ["Country", data.country],
        ["ISP", data.isp],
        ["Org", data.org],
        ["Lat/Lon", `${data.lat}, ${data.lon}`],
      ];
      const rows = fields
        .map(([k, v]) => `<div class="ip-row"><span class="ip-label">${k}</span><span class="ip-value">${v || "N/A"}</span></div>`)
        .join("");
      return {
        title: `IP Info: ${data.query}`,
        html: `<div class="command-result command-ip-info">${rows}</div>`,
      };
    } catch {
      return {
        title: "IP Lookup",
        html: `<div class="command-result"><p>Failed to fetch IP data. Please try again.</p></div>`,
      };
    }
  },
};

export default ipCommand;
