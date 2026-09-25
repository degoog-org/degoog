import type {
  Transport,
  TransportContext,
  TransportFetchOptions,
} from "../../../../types/extension";
import { logger } from "../../../../utils/logger";
import { fetchViaCurl } from "./curl-fetch";

export class CurlTransport implements Transport {
  name = "curl";
  displayName = "Curl";
  description = "Uses the curl binary for requests. Useful as a TLS fallback.";

  available() {
    try {
      Bun.spawnSync(["curl", "--version"]);
      return true;
    } catch (err) {
      logger.debug("transport:curl", "curl binary probe failed", err);
      return false;
    }
  }

  async fetch(
    url: string,
    options: TransportFetchOptions,
    context: TransportContext,
  ): Promise<Response> {
    logger.debug("outgoing", `curl ${new URL(url).hostname}`);
    return fetchViaCurl(url, options, context.proxyUrl);
  }
}
