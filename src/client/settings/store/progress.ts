import { getBase } from "../../utils/base-url";
import {
  isStoreEvent,
  type StoreStreamEvent,
  type StoreStreamPhase,
} from "../../../shared/store-stream";

type Phase = StoreStreamPhase;

export interface ItemKey {
  repoUrl: string;
  itemPath: string;
  type: string;
}

const esc = (v: string): string => v.replace(/"/g, '\\"');

function itemTargets(container: HTMLElement, key: ItemKey): HTMLElement[] {
  const attr = `[data-repo-url="${esc(key.repoUrl)}"][data-item-path="${esc(key.itemPath)}"][data-type="${esc(key.type)}"]`;
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      `.store-card${attr}, .store-updates-row${attr}`,
    ),
  );
}

function repoTargets(container: HTMLElement, url: string): HTMLElement[] {
  const attr = `[data-url="${esc(url)}"]`;
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      `.store-repo-item${attr}, .store-repo-detail${attr}`,
    ),
  );
}

function ensureOverlay(el: HTMLElement): HTMLElement {
  let overlay = el.querySelector<HTMLElement>(":scope > .store-progress");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "store-progress";
    overlay.innerHTML = `
      <span class="store-progress-label"></span>
      <span class="store-progress-bar"><span class="store-progress-bar-fill"></span></span>`;
    el.appendChild(overlay);
  }
  return overlay;
}

function applyPhase(
  els: HTMLElement[],
  verb: string,
  phase: Phase,
  error?: string,
): void {
  for (const el of els) {
    el.classList.add("store-progress-host");
    const overlay = ensureOverlay(el);
    const label = overlay.querySelector<HTMLElement>(".store-progress-label");
    el.classList.remove("is-working", "is-ok", "is-failed");
    if (phase === "start") {
      el.classList.add("is-working");
      if (label) label.textContent = `${verb}…`;
    } else if (phase === "ok") {
      el.classList.add("is-ok");
      if (label) label.textContent = "Done";
    } else {
      el.classList.add("is-failed");
      if (label) label.textContent = error || "Failed";
    }
  }
}

export function setItemPhase(
  container: HTMLElement,
  key: ItemKey,
  verb: string,
  phase: Phase,
  error?: string,
): void {
  applyPhase(itemTargets(container, key), verb, phase, error);
}

export function setRepoPhase(
  container: HTMLElement,
  url: string,
  verb: string,
  phase: Phase,
  error?: string,
): void {
  applyPhase(repoTargets(container, url), verb, phase, error);
}

function streamStoreOp(
  path: string,
  getToken: () => string | null,
  event: string,
  onEvent: (e: StoreStreamEvent) => void,
): Promise<{ failed: number } | null> {
  return new Promise((resolve) => {
    const token = getToken();
    const sep = path.includes("?") ? "&" : "?";
    const url = `${getBase()}${path}${token ? `${sep}token=${encodeURIComponent(token)}` : ""}`;
    const source = new EventSource(url);
    let failed = 0;

    source.addEventListener(event, (e) => {
      const data: unknown = JSON.parse((e as MessageEvent).data);
      if (!isStoreEvent(data)) return;
      if (data.phase === "failed") failed++;
      onEvent(data);
    });

    source.addEventListener("done", (e) => {
      source.close();
      const data: unknown = JSON.parse((e as MessageEvent).data);
      const reported =
        typeof data === "object" &&
        data !== null &&
        typeof (data as { failed?: unknown }).failed === "number"
          ? (data as { failed: number }).failed
          : failed;
      resolve({ failed: reported });
    });

    source.addEventListener("failed", () => {
      source.close();
      resolve(null);
    });

    source.onerror = () => {
      source.close();
      resolve(null);
    };
  });
}

export function streamUpdateAll(
  container: HTMLElement,
  getToken: () => string | null,
): Promise<{ failed: number } | null> {
  return streamStoreOp(
    "/api/store/update-all/stream",
    getToken,
    "item",
    (e) => {
      if (!e.repoUrl || !e.itemPath || !e.type) return;
      setItemPhase(
        container,
        { repoUrl: e.repoUrl, itemPath: e.itemPath, type: e.type },
        "Updating",
        e.phase,
        e.error,
      );
    },
  );
}

export function streamRefreshAll(
  container: HTMLElement,
  getToken: () => string | null,
): Promise<{ failed: number } | null> {
  return streamStoreOp(
    "/api/store/repos/refresh/stream",
    getToken,
    "repo",
    (e) => {
      if (!e.url) return;
      setRepoPhase(container, e.url, "Refreshing", e.phase, e.error);
    },
  );
}
