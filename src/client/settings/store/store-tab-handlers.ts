import type { RepoInfo } from "../../types/store-tab";
import { jsonHeaders } from "../../utils/request";
import { confirmModal } from "../../modules/modals/confirm-modal/confirm";
import { getBase } from "../../utils/base-url";

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
  url: string,
  getToken: () => string | null,
  refreshAndRender: () => Promise<void>,
  loadReposStatus: () => Promise<void>,
  render: () => void,
): Promise<void> {
  const res = await fetch(`${getBase()}/api/store/repos/refresh`, {
    method: "POST",
    headers: jsonHeaders(getToken),
    body: JSON.stringify({ url }),
  });
  if (!res.ok) return;
  await refreshAndRender();
  void loadReposStatus().then(() => render());
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
  btn: HTMLButtonElement,
  getToken: () => string | null,
  loadItems: () => Promise<void>,
  render: () => void,
): Promise<void> {
  const { repoUrl, itemPath, type } = btn.dataset;
  if (
    type === "plugin" &&
    !(await confirmModal({
      title: "Install plugin?",
      message:
        "This plugin will run code on your server. Only install from sources you trust. Continue?",
    }))
  )
    return;
  btn.disabled = true;
  try {
    const res = await fetch(`${getBase()}/api/store/install`, {
      method: "POST",
      headers: jsonHeaders(getToken),
      body: JSON.stringify({ repoUrl, itemPath, type }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) alert(data.error || "Install failed");
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

export async function handleUpdate(
  btn: HTMLButtonElement,
  getToken: () => string | null,
  loadItems: () => Promise<void>,
  render: () => void,
): Promise<void> {
  const { repoUrl, itemPath, type } = btn.dataset;
  btn.disabled = true;
  try {
    const res = await fetch(`${getBase()}/api/store/update`, {
      method: "POST",
      headers: jsonHeaders(getToken),
      body: JSON.stringify({ repoUrl, itemPath, type }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) alert(data.error || "Update failed");
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
    const res = await fetch(`${getBase()}/api/store/update-all`, {
      method: "POST",
      headers: jsonHeaders(getToken),
    });
    const data = (await res.json()) as { error?: string; updated?: number };
    if (!res.ok) alert(data.error || "Update failed");
    else {
      await loadItems();
      render();
      window.dispatchEvent(new CustomEvent("extensions-saved"));
    }
  } catch {
    alert("Network error");
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
    await fetch(`${getBase()}/api/store/repos/refresh`, {
      method: "POST",
      headers: jsonHeaders(getToken),
      body: JSON.stringify({}),
    });
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
