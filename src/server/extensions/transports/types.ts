import type { SettingField } from "../../types";

export interface TransportFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  redirect?: RequestRedirect;
  signal?: AbortSignal;
}

export type ProxyAwareFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface TransportContext {
  proxyUrl?: string;
  fetch: ProxyAwareFetch;
}

export interface Transport {
  name: string;
  displayName?: string;
  description?: string;
  timeoutMs?: number;
  settingsSchema?: SettingField[];
  configure?(settings: Record<string, string | string[]>): void;
  available(): boolean | Promise<boolean>;
  fetch(
    url: string,
    options: TransportFetchOptions,
    context: TransportContext,
  ): Promise<Response>;
}
