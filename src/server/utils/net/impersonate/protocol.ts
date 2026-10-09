export interface WorkerInit {
  type: "init";
  libPath: string;
}

export interface WorkerFetch {
  type: "fetch";
  id: number;
  url: string;
  method: string;
  headers: [string, string][];
  body?: Uint8Array;
  proxyUrl?: string;
  egressKey: string;
  followRedirects: boolean;
  timeoutMs: number;
  target: string;
  defaultHeaders: boolean;
  acceptEncoding?: string;
  cookieJar?: string;
  maxBytes: number;
}

export interface WorkerCancel {
  type: "cancel";
  id: number;
}

export type WorkerReply =
  | { type: "ready" }
  | { type: "unavailable"; message: string }
  | {
      type: "done";
      id: number;
      status: number;
      head: string;
      body: ArrayBuffer;
      effectiveUrl: string;
      cookieJar?: string;
    }
  | { type: "failed"; id: number; code: number; message: string }
  | { type: "cancelled"; id: number };
