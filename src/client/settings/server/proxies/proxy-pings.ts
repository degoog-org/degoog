import { el } from "../fields";
import { pingAllProxies } from "./proxy-state";

const _proxiesVisible = (container: HTMLElement | null): boolean =>
  !!el("proxy-enabled")?.checked &&
  !!container?.closest(".settings-tab-panel")?.classList.contains("active");

export function bindProxyPings(container: HTMLElement | null): void {
  const pingIfVisible = (): void => {
    if (_proxiesVisible(container)) void pingAllProxies();
  };
  window.addEventListener("settings-tab-changed", (e) => {
    if ((e as CustomEvent<string>).detail === "server") pingIfVisible();
  });
  el("proxy-enabled")?.addEventListener("change", pingIfVisible);
  pingIfVisible();
}
