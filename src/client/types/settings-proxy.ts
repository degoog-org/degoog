export type ProxyPingStatus = "idle" | "pending" | "ok" | "leak" | "fail";

export interface ProxyPingResult {
  ok: boolean;
  ms: number | null;
  ip: string | null;
}

export interface ProxyTestResult {
  enabled: boolean;
  directIp: string | null;
  proxies: ProxyPingResult[];
}

export interface ProxyRow {
  id: string;
  url: string;
  status: ProxyPingStatus;
  ms: number | null;
  ip: string | null;
}

export interface ProxyRowActions {
  rowInput: (e: Event) => void;
  rowCommit: (e: Event) => void;
  rowRemove: (e: Event) => void;
  addRow: () => void;
  openBulk: () => void;
  showAll: () => void;
}
