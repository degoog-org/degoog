import { logger } from "../../server/utils/logger";
import type { UovadipasquaClientStorageBinding } from "../../server/types";
import { getBase } from "./base-url";

interface UovadipasquaMatchPayload {
  id: string;
  scriptUrl: string;
  styleUrl?: string;
  waitForResults: boolean;
  repeatOnQuery?: boolean;
}

interface UovadipasquaStorageBindingPayload {
  extensionId: string;
  styleUrl?: string;
  localStorageKey?: string;
}

const _injectedStyleUrls = new Set<string>();

export function injectUovadipasquaStyle(styleUrl: string | undefined): void {
  if (!styleUrl || _injectedStyleUrls.has(styleUrl)) return;
  if (document.querySelector(`link[href="${styleUrl}"]`)) {
    _injectedStyleUrls.add(styleUrl);
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = styleUrl;
  document.head.appendChild(link);
  _injectedStyleUrls.add(styleUrl);
}

type UovadRunContext = {
  query: string;
};

const _fired = new Set<string>();
const RESULTS_READY_EVENT = "degoog-results-ready";
const RESULTS_WAIT_TIMEOUT_MS = 8000;

let _clientStorageBindings: UovadipasquaClientStorageBinding[] | null = null;

async function _ensureClientStorageBindings(): Promise<
  UovadipasquaClientStorageBinding[]
> {
  if (_clientStorageBindings) return _clientStorageBindings;
  try {
    const res = await fetch(`${getBase()}/api/uovadipasqua/client-storage`, {
      cache: "no-store",
    });
    if (!res.ok) {
      _clientStorageBindings = [];
      return _clientStorageBindings;
    }
    const data = (await res.json()) as {
      bindings?: UovadipasquaStorageBindingPayload[];
    };
    _clientStorageBindings = Array.isArray(data.bindings)
      ? data.bindings.filter(
          (b): b is UovadipasquaClientStorageBinding =>
            typeof b.extensionId === "string",
        )
      : [];
  } catch {
    _clientStorageBindings = [];
  }
  return _clientStorageBindings;
}

export async function applyUovaStorage(): Promise<void> {
  const bindings = await _ensureClientStorageBindings();
  await Promise.all(
    bindings.map(async ({ extensionId, styleUrl, localStorageKey }) => {
      if (
        styleUrl &&
        localStorageKey &&
        localStorage.getItem(localStorageKey)
      ) {
        injectUovadipasquaStyle(styleUrl);
      }
      const url = `${getBase()}/uovadipasqua/${extensionId}/script.js`;
      try {
        const mod = (await import(url)) as {
          restore?: () => void | Promise<void>;
        };
        await mod.restore?.();
      } catch (err) {
        logger.warn("uovadipasqua", `restore failed for "${extensionId}"`, err);
      }
    }),
  );
}

const _resultsAlreadyRendered = (): boolean => {
  const list = document.getElementById("results-list");
  return !!list && list.querySelectorAll(".result-item").length > 0;
};

const _waitForResults = (): Promise<void> =>
  new Promise((resolve) => {
    if (_resultsAlreadyRendered()) {
      resolve();
      return;
    }
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      window.removeEventListener(RESULTS_READY_EVENT, finish);
      resolve();
    };
    window.addEventListener(RESULTS_READY_EVENT, finish, { once: true });
    window.setTimeout(finish, RESULTS_WAIT_TIMEOUT_MS);
  });

export async function triggerUovadipasqua(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;
  try {
    const res = await fetch(
      `${getBase()}/api/uovadipasqua/match?q=${encodeURIComponent(trimmed)}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as { matches: UovadipasquaMatchPayload[] };
    for (const match of data.matches) {
      const key = `${match.id}::${trimmed.toLowerCase()}`;
      if (!match.repeatOnQuery) {
        if (_fired.has(key)) continue;
        _fired.add(key);
      }
      void (async () => {
        if (match.waitForResults) await _waitForResults();
        injectUovadipasquaStyle(match.styleUrl);
        try {
          const mod = (await import(match.scriptUrl)) as {
            run?: (ctx: UovadRunContext) => void | Promise<void>;
          };
          if (typeof mod.run === "function") {
            await mod.run({ query: trimmed });
          }
        } catch (err) {
          logger.warn("uovadipasqua", `failed to run "${match.id}"`, err);
        }
      })();
    }
  } catch (err) {
    logger.warn("uovadipasqua", "match request failed", err);
  }
}
