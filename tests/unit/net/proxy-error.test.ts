import { describe, expect, test } from "bun:test";
import { fetchViaSocks } from "../../../src/server/utils/net/socks-fetch";
import { fetchViaHttpProxy } from "../../../src/server/utils/net/http-proxy-fetch";
import { isProxyConnectError } from "../../../src/server/utils/net/proxy-error";
import { curlFailure } from "../../../src/server/extensions/transports/utils/curl-failure";

const DEAD_PROXY_PORT = 1;

const failure = async (run: () => Promise<Response>): Promise<unknown> => {
  try {
    await run();
  } catch (err) {
    return err;
  }
  throw new Error("expected the request to fail");
};

describe("proxy connect errors", () => {
  test("a dead socks proxy is reported as the proxy's fault", async () => {
    const err = await failure(() =>
      fetchViaSocks("https://example.test/", `socks5://127.0.0.1:${DEAD_PROXY_PORT}`),
    );
    expect(isProxyConnectError(err)).toBe(true);
  });

  test("a dead http proxy is reported as the proxy's fault", async () => {
    const err = await failure(() =>
      fetchViaHttpProxy("https://example.test/", `http://127.0.0.1:${DEAD_PROXY_PORT}`),
    );
    expect(isProxyConnectError(err)).toBe(true);
  });

  test("curl only blames the proxy for proxy exit codes while a proxy is in use", () => {
    expect(isProxyConnectError(curlFailure(7, "failed to connect", true))).toBe(true);
    expect(isProxyConnectError(curlFailure(97, "proxy handshake", true))).toBe(true);
    expect(isProxyConnectError(curlFailure(7, "failed to connect", false))).toBe(false);
    expect(isProxyConnectError(curlFailure(28, "timed out", true))).toBe(false);
  });
});
