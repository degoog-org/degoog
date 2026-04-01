import { authHeaders, jsonHeaders } from "../utils/request";
import { initProxyTest } from "./proxy-test";

export async function initServerTab(
  getToken: () => string | null,
): Promise<void> {
  const proxyEnabled = document.getElementById(
    "settings-proxy-enabled",
  ) as HTMLInputElement | null;
  const proxyUrlsWrap = document.getElementById("settings-proxy-urls-wrap");
  const proxyUrls = document.getElementById(
    "settings-proxy-urls",
  ) as HTMLTextAreaElement | null;
  const rateLimitEnabled = document.getElementById(
    "settings-rate-limit-enabled",
  ) as HTMLInputElement | null;
  const rateLimitOptions = document.getElementById(
    "settings-rate-limit-options",
  );
  const rateLimitBurstWindow = document.getElementById(
    "settings-rate-limit-burst-window",
  ) as HTMLInputElement | null;
  const rateLimitBurstMax = document.getElementById(
    "settings-rate-limit-burst-max",
  ) as HTMLInputElement | null;
  const rateLimitLongWindow = document.getElementById(
    "settings-rate-limit-long-window",
  ) as HTMLInputElement | null;
  const rateLimitLongMax = document.getElementById(
    "settings-rate-limit-long-max",
  ) as HTMLInputElement | null;

  const languagesEnabled = document.getElementById(
    "settings-languages-enabled",
  ) as HTMLInputElement | null;
  const languagesWrap = document.getElementById("settings-languages-wrap");
  const languagesTextarea = document.getElementById(
    "settings-languages",
  ) as HTMLTextAreaElement | null;

  const streamingEnabled = document.getElementById(
    "settings-streaming-enabled",
  ) as HTMLInputElement | null;
  const streamingOptions = document.getElementById("settings-streaming-options");
  const streamingAutoRetry = document.getElementById(
    "settings-streaming-auto-retry",
  ) as HTMLInputElement | null;
  const streamingRetryWrap = document.getElementById(
    "settings-streaming-retry-wrap",
  );
  const streamingMaxRetries = document.getElementById(
    "settings-streaming-max-retries",
  ) as HTMLInputElement | null;

  try {
    const res = await fetch("/api/settings/general", {
      headers: authHeaders(getToken),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        proxyEnabled?: string;
        proxyUrls?: string;
        rateLimitEnabled?: string;
        rateLimitBurstWindow?: string;
        rateLimitBurstMax?: string;
        rateLimitLongWindow?: string;
        rateLimitLongMax?: string;
        languagesEnabled?: string;
        languages?: string;
        streamingEnabled?: string;
        streamingAutoRetry?: string;
        streamingMaxRetries?: string;
      };
      if (languagesEnabled && languagesWrap) {
        languagesEnabled.checked = data.languagesEnabled === "true";
        languagesWrap.style.display = languagesEnabled.checked
          ? "block"
          : "none";
      }
      if (languagesTextarea) languagesTextarea.value = data.languages ?? "";
      if (proxyEnabled) {
        proxyEnabled.checked = data.proxyEnabled === "true";
      }
      if (proxyUrls) proxyUrls.value = data.proxyUrls ?? "";
      if (proxyUrlsWrap) {
        proxyUrlsWrap.style.display = proxyEnabled?.checked ? "block" : "none";
      }
      if (rateLimitEnabled && rateLimitOptions) {
        rateLimitEnabled.checked = data.rateLimitEnabled === "true";
        rateLimitOptions.style.display = rateLimitEnabled.checked
          ? "block"
          : "none";
      }
      if (rateLimitBurstWindow)
        rateLimitBurstWindow.value = data.rateLimitBurstWindow ?? "";
      if (rateLimitBurstMax)
        rateLimitBurstMax.value = data.rateLimitBurstMax ?? "";
      if (rateLimitLongWindow)
        rateLimitLongWindow.value = data.rateLimitLongWindow ?? "";
      if (rateLimitLongMax)
        rateLimitLongMax.value = data.rateLimitLongMax ?? "";
      if (streamingEnabled && streamingOptions) {
        streamingEnabled.checked = data.streamingEnabled === "true";
        streamingOptions.style.display = streamingEnabled.checked
          ? "block"
          : "none";
      }
      if (streamingAutoRetry && streamingRetryWrap) {
        streamingAutoRetry.checked = data.streamingAutoRetry === "true";
        streamingRetryWrap.style.display = streamingAutoRetry.checked
          ? "block"
          : "none";
      }
      if (streamingMaxRetries)
        streamingMaxRetries.value = data.streamingMaxRetries ?? "";
    }
  } catch {}

  if (proxyEnabled && proxyUrlsWrap) {
    proxyEnabled.addEventListener("change", () => {
      proxyUrlsWrap.style.display = proxyEnabled.checked ? "block" : "none";
    });
    initProxyTest(getToken);
  }
  if (languagesEnabled && languagesWrap) {
    languagesEnabled.addEventListener("change", () => {
      languagesWrap.style.display = languagesEnabled.checked ? "block" : "none";
    });
  }
  if (rateLimitEnabled && rateLimitOptions) {
    rateLimitEnabled.addEventListener("change", () => {
      rateLimitOptions.style.display = rateLimitEnabled.checked
        ? "block"
        : "none";
    });
  }
  if (streamingEnabled && streamingOptions) {
    streamingEnabled.addEventListener("change", () => {
      streamingOptions.style.display = streamingEnabled.checked
        ? "block"
        : "none";
    });
  }
  if (streamingAutoRetry && streamingRetryWrap) {
    streamingAutoRetry.addEventListener("change", () => {
      streamingRetryWrap.style.display = streamingAutoRetry.checked
        ? "block"
        : "none";
    });
  }

  const _rateLimitPayload = (): Record<string, string> => {
    const payload: Record<string, string> = {
      rateLimitEnabled: rateLimitEnabled?.checked ? "true" : "false",
    };
    if (
      rateLimitEnabled?.checked &&
      rateLimitBurstWindow &&
      rateLimitBurstMax &&
      rateLimitLongWindow &&
      rateLimitLongMax
    ) {
      const bw = rateLimitBurstWindow.value.trim();
      const bm = rateLimitBurstMax.value.trim();
      const lw = rateLimitLongWindow.value.trim();
      const lm = rateLimitLongMax.value.trim();
      if (bw) payload.rateLimitBurstWindow = bw;
      if (bm) payload.rateLimitBurstMax = bm;
      if (lw) payload.rateLimitLongWindow = lw;
      if (lm) payload.rateLimitLongMax = lm;
    }
    return payload;
  };

  document
    .getElementById("settings-save")
    ?.addEventListener("click", async () => {
      try {
        await fetch("/api/settings/general", {
          method: "POST",
          headers: jsonHeaders(getToken),
          body: JSON.stringify({
            proxyEnabled: proxyEnabled?.checked ? "true" : "false",
            proxyUrls: proxyUrls?.value.trim() ?? "",
            languagesEnabled: languagesEnabled?.checked ? "true" : "false",
            languages: languagesTextarea?.value.trim() ?? "",
            ..._rateLimitPayload(),
            streamingEnabled: streamingEnabled?.checked ? "true" : "false",
            streamingAutoRetry: streamingAutoRetry?.checked ? "true" : "false",
            streamingMaxRetries: streamingMaxRetries?.value.trim() ?? "",
          }),
        });
      } catch {}
      const btn = document.getElementById("settings-save");
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = "Saved";
        setTimeout(() => {
          btn.textContent = prev;
        }, 1200);
      }
    });

  document
    .getElementById("settings-cache-clear")
    ?.addEventListener("click", async () => {
      const btn = document.getElementById("settings-cache-clear");
      try {
        await fetch("/api/cache/clear", { method: "POST" });
        if (btn) {
          const prev = btn.textContent;
          btn.textContent = "Cleared";
          setTimeout(() => {
            btn.textContent = prev;
          }, 1500);
        }
      } catch {
        if (btn) btn.textContent = "Failed";
      }
    });
}
