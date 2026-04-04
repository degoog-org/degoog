import { fetchViaCurl } from "./curl-fetch";
import { debug } from "../../../../utils/logger";
import type { Transport, TransportFetchOptions, TransportContext } from "../../types";

export class CurlTransport implements Transport {
  name = "curl";
  displayName = "Curl";
  description = "Uses the curl binary for requests. Useful as a TLS fallback.";

  available() {
    try {
      Bun.spawnSync(["curl", "--version"]);
      return true;
    } catch {
      return false;
    }
  }

  async fetch(
    url: string,
    options: TransportFetchOptions,
    context: TransportContext,
  ): Promise<Response> {
    debug("outgoing", `curl ${new URL(url).hostname}`);
    return fetchViaCurl(url, options, context.proxyUrl);
  }
}
