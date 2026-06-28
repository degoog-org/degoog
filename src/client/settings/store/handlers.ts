import type { RepoInfo } from "../../types/store-tab";
import { jsonHeaders } from "../../utils/request";
import { confirmModal } from "../../modules/modals/confirm-modal/confirm";
import { getBase } from "../../utils/base-url";
import {
  setItemPhase,
  setRepoPhase,
  streamRefreshAll,
  streamUpdateAll,
} from "./progress";

export function showError(el: HTMLElement | null, msg: string): void {
  if (!el) return;
  el.textContent = msg;
  el.classList.add("store-error-visible");
  setTimeout(() => el.classList.remove("store-error-visible"), 4000);
}

export async function handleAddRepo(
  inputEl: HTMLInputElement | null,
  addBtn: HTMLButtonElement,
  errorEl: HTMLElement | null,
  getToken: () => string | null,
  refreshAndRender: () => Promise<void>,
): Promise<void> {
  const url = inputEl?.value?.trim();
  if (!url) return;
  addBtn.disabled = true;
  if (errorEl) errorEl.textContent = "";
  try {
    const res = await fetch(`${getBase()}/api/store/repos`, {
      method: "POST",
      headers: jsonHeaders(getToken),
      body: JSON.stringify({ url }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      showError(errorEl, data.error || "Failed to add repository");
      return;
    }
    if (inputEl) inputEl.value = "";
    await refreshAndRender();
  } catch {
    showError(errorEl, "Network error");
  } finally {
    addBtn.disabled = false;
  }
}

export async function handleRefresh(
  container: HTMLElement,
  url: string,
  getToken: () => string | null,
  refreshAndRender: () => Promise<void>,
  loadReposStatus: () => Promise<void>,
  render: () => void,
): Promise<void> {
  setRepoPhase(container, url, "Refreshing", "start");
  try {
    const res = await fetch(`${getBase()}/api/store/repos/refresh`, {
      method: "POST",
      headers: jsonHeaders(getToken),
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      setRepoPhase(container, url, "Refreshing", "failed");
      return;
    }
    setRepoPhase(container, url, "Refreshing", "ok");
    await refreshAndRender();
    void loadReposStatus().then(() => render());
  } catch {
    setRepoPhase(container, url, "Refreshing", "failed", "Network error");
  }
}

export async function handleRemove(
  url: string,
  repos: RepoInfo[],
  getToken: () => string | null,
  refreshAndRender: () => Promise<void>,
): Promise<void> {
  const fromRepo = repos.find((r) => r.url === url);
  if (!fromRepo) return;
  const res = await fetch(`${getBase()}/api/store/repos`, {
    method: "DELETE",
    headers: jsonHeaders(getToken),
    body: JSON.stringify({ url }),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) {
    alert(data.error || "Failed to remove repository");
    return;
  }
  await refreshAndRender();
}

export async function handleInstall(
  container: HTMLElement,
  btn: HTMLButtonElement,
  getToken: () => string | null,
  loadItems: () => Promise<void>,
  render: () => void,
): Promise<void> {
  const { repoUrl, itemPath, type } = btn.dataset;
  if (!repoUrl || !itemPath || !type) return;
  if (
    type === "plugin" &&
    !(await confirmModal({
      title: "Install plugin?",
      message:
        "This plugin will run code on your server. Only install from sources you trust. Continue?",
    }))
  )
    return;
  const key = { repoUrl, itemPath, type };
  btn.disabled = true;
  setItemPhase(container, key, "Installing", "start");
  try {
    const res = await fetch(`${getBase()}/api/store/install`, {
      method: "POST",
      headers: jsonHeaders(getToken),
      body: JSON.stringify({ repoUrl, itemPath, type }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setItemPhase(container, key, "Installing", "failed", data.error);
      return;
    }
    setItemPhase(container, key, "Installing", "ok");
    await loadItems();
    render();
    window.dispatchEvent(new CustomEvent("extensions-saved"));
  } catch {
    setItemPhase(container, key, "Installing", "failed", "Network error");
  } finally {
    btn.disabled = false;
  }
}

export async function handleUninstall(
  btn: HTMLButtonElement,
  getToken: () => string | null,
  loadItems: () => Promise<void>,
  render: () => void,
): Promise<void> {
  const { repoUrl, itemPath, type } = btn.dataset;
  if (
    !(await confirmModal({
      title: "Uninstall?",
      message: `Uninstall this ${type ?? "item"}?`,
    }))
  )
    return;
  btn.disabled = true;
  try {
    const res = await fetch(`${getBase()}/api/store/uninstall`, {
      method: "POST",
      headers: jsonHeaders(getToken),
      body: JSON.stringify({ repoUrl, itemPath, type }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) alert(data.error || "Uninstall failed");
    else {
      await loadItems();
      render();
      window.dispatchEvent(new CustomEvent("extensions-saved"));
    }
  } catch {
    alert("Network error");
  } finally {
    btn.disabled = false;
  }
}

export async function handleDeleteUntracked(
  btn: HTMLButtonElement,
  getToken: () => string | null,
  loadItems: () => Promise<void>,
  render: () => void,
): Promise<void> {
  const { folderName, type } = btn.dataset;
  if (
    !(await confirmModal({
      title: "Delete?",
      message: `Permanently delete this ${type ?? "extension"} from disk?`,
    }))
  )
    return;
  btn.disabled = true;
  try {
    const res = await fetch(`${getBase()}/api/store/untracked`, {
      method: "DELETE",
      headers: jsonHeaders(getToken),
      body: JSON.stringify({ folderName, type }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) alert(data.error || "Delete failed");
    else {
      await loadItems();
      render();
      window.dispatchEvent(new CustomEvent("extensions-saved"));
    }
  } catch {
    alert("Network error");
  } finally {
    btn.disabled = false;
  }
}

export async function handleUpdate(
  container: HTMLElement,
  btn: HTMLButtonElement,
  getToken: () => string | null,
  loadItems: () => Promise<void>,
  render: () => void,
): Promise<void> {
  const { repoUrl, itemPath, type } = btn.dataset;
  if (!repoUrl || !itemPath || !type) return;
  const key = { repoUrl, itemPath, type };
  btn.disabled = true;
  setItemPhase(container, key, "Updating", "start");
  try {
    const res = await fetch(`${getBase()}/api/store/update`, {
      method: "POST",
      headers: jsonHeaders(getToken),
      body: JSON.stringify({ repoUrl, itemPath, type }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setItemPhase(container, key, "Updating", "failed", data.error);
      return;
    }
    setItemPhase(container, key, "Updating", "ok");
    await loadItems();
    render();
    window.dispatchEvent(new CustomEvent("extensions-saved"));
  } catch {
    setItemPhase(container, key, "Updating", "failed", "Network error");
  } finally {
    btn.disabled = false;
  }
}

export async function handleUpdateAll(
  container: HTMLElement,
  getToken: () => string | null,
  loadItems: () => Promise<void>,
  render: () => void,
): Promise<void> {
  const btn = container.querySelector<HTMLButtonElement>(
    ".store-btn-update-all",
  );
  if (btn) btn.disabled = true;
  try {
    await streamUpdateAll(container, getToken);
    await loadItems();
    render();
    window.dispatchEvent(new CustomEvent("extensions-saved"));
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function handleRefreshAll(
  container: HTMLElement,
  getToken: () => string | null,
  refreshAndRender: () => Promise<void>,
  loadReposStatus: () => Promise<void>,
  render: () => void,
): Promise<void> {
  const btn = container.querySelector<HTMLButtonElement>(
    ".store-btn-refresh-all",
  );
  if (btn) btn.disabled = true;
  try {
    await streamRefreshAll(container, getToken);
    await refreshAndRender();
    void loadReposStatus().then(() => render());
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function confirmRemoveRepo(_url: string): Promise<boolean> {
  const ok = await confirmModal({
    title: "Remove repository?",
    message:
      "Remove this repository? You must uninstall any installed items first.",
  });
  return ok;
}
