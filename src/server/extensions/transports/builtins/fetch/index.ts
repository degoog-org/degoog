import { fetch as bunFetch } from "bun";
import { isSocksProxy, fetchViaSocks } from "../../../../utils/net/socks-fetch";
import { fetchViaHttpProxy } from "../../../../utils/net/http-proxy-fetch";
import type {
  Transport,
  TransportContext,
  TransportFetchOptions,
} from "../../../../types/extension";

export class FetchTransport implements Transport {
  name = "fetch";
  usesContextProxy = true;
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

    const proxied = { method, redirect, signal, headers, body: body ?? undefined };
    if (isSocksProxy(context.proxyUrl)) {
      return fetchViaSocks(url, context.proxyUrl, proxied, undefined, context.egressKey);
    }
    return fetchViaHttpProxy(url, context.proxyUrl, proxied, undefined, context.egressKey);
  }
}
