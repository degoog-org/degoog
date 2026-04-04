import { FetchTransport } from "../fetch";
import { CurlTransport } from "../curl";
import { debug } from "../../../../utils/logger";
import type {
  Transport,
  TransportFetchOptions,
  TransportContext,
} from "../../types";

const _fetchTransport = new FetchTransport();
const _curlTransport = new CurlTransport();

function _shouldRetryWithCurl(status: number): boolean {
  return status === 429 || status === 403 || status === 502 || status === 503;
}

export class AutoTransport implements Transport {
  name = "curl-fallback";
  displayName = "Curl Fallback";
  description =
    "Tries Bun's native fetch first, falls back to curl on 403/429/502/503.";

  available() {
    return true;
  }

  async fetch(
    url: string,
    options: TransportFetchOptions,
    context: TransportContext,
  ): Promise<Response> {
    const first = await _fetchTransport.fetch(url, options, context);

    if (_shouldRetryWithCurl(first.status)) {
      debug("outgoing", `curl fallback retry ${new URL(url).hostname}`);
      return _curlTransport.fetch(url, options, context);
    }

    return first;
  }
}
