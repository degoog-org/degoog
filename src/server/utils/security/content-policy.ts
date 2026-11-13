import { getInstanceSettings } from "../settings/server-settings";
import { asBoolean } from "../settings/plugin-settings";
import { LEAKS_ALLOWED_COOKIE } from "../../../shared/leak-guard";

export const CSP_HEADER = "Content-Security-Policy";
export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";
export const BLOCK_CLIENT_LEAKS_KEY = "blockClientLeaks";

const BASELINE_CSP = "object-src 'none'; base-uri 'none'; frame-ancestors 'self'";

export const SVG_CSP = `${BASELINE_CSP}; script-src 'none'; sandbox`;
export const SANDBOXED_IMAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

const _nojsCsp = (imgSrc: string): string =>
  `default-src 'self'; img-src ${imgSrc}; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'`;

export const LEAK_GUARD_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "worker-src 'self' blob:",
].join("; ");

export type ContentPolicyTarget = {
  nojs: boolean;
  html: boolean;
  blockLeaks: boolean;
};

export const contentPolicyHeaders = ({
  nojs,
  html,
  blockLeaks,
}: ContentPolicyTarget): Record<string, string> => {
  if (nojs) {
    return { [CSP_HEADER]: _nojsCsp(blockLeaks ? "'self' data:" : "'self' data: https:") };
  }
  if (!html) return { [CSP_HEADER]: BASELINE_CSP };
  if (blockLeaks) return { [CSP_HEADER]: `${BASELINE_CSP}; ${LEAK_GUARD_POLICY}` };
  return { [CSP_HEADER]: BASELINE_CSP, [CSP_REPORT_ONLY_HEADER]: LEAK_GUARD_POLICY };
};

export const blockClientLeaksOn = async (): Promise<boolean> =>
  asBoolean((await getInstanceSettings())[BLOCK_CLIENT_LEAKS_KEY]);

const _webrtcGuard = (block: boolean): string =>
  `["RTCPeerConnection","webkitRTCPeerConnection"].forEach(function(n){var O=window[n];if(!O)return;var G=function(c){var s=(c&&c.iceServers||[]).map(function(x){return [].concat(x.urls||x.url||[]).join(" ")}).join(" ");var b=${block ? `document.cookie.indexOf("${LEAKS_ALLOWED_COOKIE}=1")<0` : "false"};window.__DEGOOG_LEAKS__.push({url:s||"webrtc:",directive:"webrtc",disposition:b?"enforce":"report"});if(b)throw new DOMException("Blocked by degoog","NotAllowedError");return new (Function.prototype.bind.apply(O,[null].concat([].slice.call(arguments))))()};G.prototype=O.prototype;window[n]=G});`;

export const leakBufferScript = (block: boolean): string =>
  `<script>window.__DEGOOG_LEAKS__=[];document.addEventListener("securitypolicyviolation",function(e){window.__DEGOOG_LEAKS__.push({url:e.blockedURI,directive:e.effectiveDirective||e.violatedDirective,source:e.sourceFile,disposition:e.disposition})});${_webrtcGuard(block)}</script>`;
