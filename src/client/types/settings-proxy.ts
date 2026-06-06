export interface ProxyTestResult {
  enabled: boolean;
  directIp: string | null;
  proxyIp: string | null;
  match: boolean | null;
}
