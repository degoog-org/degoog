import { fetch as bunFetch } from "bun";
import { isSocksProxy, fetchViaSocks } from "../../../../utils/socks-fetch";
import { fetchViaHttpProxy } from "../../../../utils/http-proxy-fetch";
import type {
  Transport,
  TransportFetchOptions,
  TransportContext,
} from "../../types";

export class FetchTransport implements Transport {
  name = "fetch";
  displayName = "Fetch";
  description = "Native Bun fetch with SOCKS/HTTP proxy support.";

  available() {
    return true;
  }

  async fetch(
    url: string,
    options: TransportFetchOptions,
    context: TransportContext,
  ): Promise<Response> {
    const method = options.method ?? "GET";
    const redirect = options.redirect ?? "follow";
    const { signal, headers, body } = options;

    if (!context.proxyUrl) {
      return bunFetch(url, { method, redirect, signal, headers, body });
    }

    if (isSocksProxy(context.proxyUrl)) {
      return fetchViaSocks(url, context.proxyUrl, {
        method,
        redirect,
        signal,
        headers,
        body: body ?? undefined,
      });
    }

    return fetchViaHttpProxy(url, context.proxyUrl, {
      method,
      redirect,
      signal,
      headers,
      body: body ?? undefined,
    });
  }
}
