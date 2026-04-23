// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

/**
 * @fccview here
 * Due to the constant cat and mouse game with big G
 * we need to constantly keep user agents in check.
 * 
 * If you want to contribute when the engine stops working feel free to use this script to test them.
 * 
 * bun run scripts/_parse-test.ts
 * 
 * OUTPUT LEGEND:
 * 
 * ✅   - got real Google results (href="/url?q=" anchors found). Number = count.
 * 429  - Google rate-limited the request (usually per-proxy-exit-IP or per-UA).
 * JS   - served the "enable JavaScript" interstitial.
 * 403  - hard blocked.
 * ??   - something else (often the 2308-byte "unsupported browser" page).
 */
const PROXIES = [
  "socks5://127.0.0.1:7995", "socks5://127.0.0.1:7996", "socks5://127.0.0.1:7997",
  "socks5://127.0.0.1:7998", "socks5://127.0.0.1:7999",
];
let _pi = 0;
const nextProxy = () => PROXIES[(_pi++) % PROXIES.length];

const UAS: [string, string][] = [
  ["OperaMini 4.2 J2ME/iPhone", "Opera/9.80 (J2ME/iPhone;Opera Mini/4.2.13918/24.793; U; en) Presto/2.5.25 Version/10.54"],
  ["OperaMini 4.2 J2ME/MIDP generic", "Opera/9.80 (J2ME/MIDP; Opera Mini/4.2.14881/870; U; en) Presto/2.4.15"],
  ["OperaMini 4.4 generic", "Opera/9.80 (J2ME/MIDP; Opera Mini/4.4.31492/30.3558; U; en) Presto/2.8.119 Version/11.10"],
  ["OperaMini 5.1 J2ME", "Opera/9.80 (J2ME/MIDP; Opera Mini/5.1.21214/28.2144; U; en) Presto/2.8.119 Version/11.10"],
  ["OperaMini 6 generic", "Opera/9.80 (J2ME/MIDP; Opera Mini/6.1.25378/28.2725; U; en) Presto/2.8.119 Version/11.10"],
  ["OperaMini 7 J2ME", "Opera/9.80 (J2ME/MIDP; Opera Mini/7.0.32444/28.2725; U; en) Presto/2.8.119 Version/11.10"],
  ["OperaMini 8 J2ME", "Opera/9.80 (J2ME/MIDP; Opera Mini/8.0.35626/37.8277; U; en) Presto/2.12.423 Version/12.16"],
  ["OperaMini 4.2 Android", "Opera/9.80 (Android; Opera Mini/4.2.13918/24.793; U; en) Presto/2.5.25 Version/10.54"],
  ["OperaMini 4.2 SymbOS", "Opera/9.80 (SymbOS; Opera Mini/4.2.13918/24.793; U; en) Presto/2.5.25 Version/10.54"],
  ["OperaMini 4.2 S60", "Opera/9.80 (S60; Opera Mini/4.2.13918/24.793; U; en) Presto/2.5.25 Version/10.54"],
  ["OperaMini 4.2 BlackBerry", "Opera/9.80 (BlackBerry; Opera Mini/4.2.13918/24.793; U; en) Presto/2.5.25 Version/10.54"],
  ["OperaMini 4.1 old", "Opera/9.50 (J2ME/MIDP; Opera Mini/4.1.15082/1357; U; en)"],
  ["OperaMini 4.0 oldest", "Opera/9.50 (J2ME/MIDP; Opera Mini/4.0.10672/1435; U; en)"],
  ["Samsung Jasmine S8003", "SAMSUNG-GT-S8003/S8003JF2 SHP/VPP/R5 Jasmine/1.0 Qtv/5.3 SMM-MMS/1.2.0 profile/MIDP-2.1 configuration/CLDC-1.1"],
  ["Samsung Jasmine S5200", "SAMSUNG-GT-S5200/S5200XXJE1 SHP/VPP/R5 Jasmine/1.0 Qtv/5.3 SMM-MMS/1.2.0 profile/MIDP-2.1 configuration/CLDC-1.1"],
  ["Samsung Dolfin 3.0", "SAMSUNG-GT-S8500/S8500XEJK1 SHP/VPP/R5 Dolfin/3.0 Nextreaming SMM-MMS/1.2.0 profile/MIDP-2.1 configuration/CLDC-1.1"],
  ["Samsung NetFront", "SAMSUNG-GT-E2550/E2550XXJH1 NetFront/3.5 Profile/MIDP-2.1 Configuration/CLDC-1.1"],
  ["Samsung SCH (CDMA)", "SAMSUNG-SCH-U940/U940XEJA1 SHP/VPP/R5 Dolfin/2.0 Nextreaming SMM-MMS/1.2.0 profile/MIDP-2.1 configuration/CLDC-1.1"],
  ["Samsung SGH (GSM)", "SAMSUNG-SGH-F480/F480XXJF1 SHP/VPP/R5 Dolfin/2.0 Nextreaming SMM-MMS/1.2.0 profile/MIDP-2.1 configuration/CLDC-1.1"],
];

const probe = async (label: string, ua: string): Promise<void> => {
  const proxy = nextProxy();
  const proc = Bun.spawn([
    "curl", "-sS", "-L", "--compressed", "--max-time", "25", "--proxy", proxy,
    "-o", "/tmp/probe.html", "-w", "%{http_code}", "-A", ua,
    "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "-H", "Accept-Language: en-US,en;q=0.9", "-H", "Cookie: CONSENT=YES+",
    "https://www.google.com/search?q=hello+world&hl=en&lr=lang_en&ie=utf8&oe=utf8&start=0&filter=0",
  ], { stdout: "pipe", stderr: "pipe" });
  const status = await new Response(proc.stdout).text();
  await proc.exited;
  let html = ""; try { html = await Bun.file("/tmp/probe.html").text(); } catch { }
  const anchors = (html.match(/href="\/url\?q=/g) || []).length;
  const verdict = anchors > 0 ? "✅" : status === "429" ? "429" : html.includes("enablejs") ? "JS" : status === "403" ? "403" : "??";
  console.log(`${verdict.padEnd(4)} http=${status} sz=${html.length.toString().padStart(6)} a=${anchors} | ${label}`);
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
for (const [l, u] of UAS) { await probe(l, u); await sleep(1200); }
