import type { ProxyPingResult, ProxyRow } from "../../types/settings-proxy";

const t = window.scopedT("core");

const USERINFO_RE = /\/\/[^@/]*@/;

export interface ProxyTestReportProps {
  directIp: string | null;
  rows: ProxyRow[];
  results: ProxyPingResult[];
}

const _outcome = (result: ProxyPingResult | undefined, directIp: string | null): string => {
  if (!result?.ok) return t("settings-page.proxy-test.row-fail");
  const vars = { ip: result.ip ?? "", ms: String(result.ms ?? 0) };
  return result.ip === directIp
    ? t("settings-page.proxy-test.row-leak", vars)
    : t("settings-page.proxy-test.row-ok", vars);
};

export const ProxyTestReport = ({ directIp, rows, results }: ProxyTestReportProps): JSX.Element => (
  <>
    <strong>
      {t("settings-page.proxy-test.summary", {
        ok: String(results.filter((r) => r.ok).length),
        total: String(rows.length),
      })}
    </strong>
    <br />
    {t("settings-page.proxy-test.direct", { ip: directIp ?? "?" })}
    <ul class="proxy-test-list">
      {rows.map((row, i) => (
        <li key={row.id}>
          <code>{row.url.replace(USERINFO_RE, "//***@")}</code>
          {" "}
          <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          {" "}
          {_outcome(results[i], directIp)}
        </li>
      ))}
    </ul>
  </>
);
