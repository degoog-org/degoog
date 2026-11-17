const t = window.scopedT("core");

const _visibleNavTabs = (): string[] =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".settings-nav .settings-nav-item[data-tab]"),
  )
    .filter((btn) => btn.style.display !== "none")
    .map((btn) => btn.dataset.tab!);

function _syncTabSelectWithNav(): void {
  const select = document.getElementById("settings-tab-select") as HTMLSelectElement | null;
  if (!select) return;
  const tabs = _visibleNavTabs();
  if (!tabs.length) return;
  const existing = new Map(Array.from(select.options).map((opt) => [opt.value, opt]));
  const selected = select.value;
  for (const tab of tabs) {
    let opt = existing.get(tab);
    if (!opt) {
      opt = document.createElement("option");
      opt.value = tab;
      opt.textContent = t(`settings-page.nav.${tab}`);
    }
    select.appendChild(opt);
    existing.delete(tab);
  }
  existing.forEach((opt) => opt.remove());
  if (tabs.includes(selected)) select.value = selected;
}

export function setIndexerNavVisible(visible: boolean): void {
  document.querySelectorAll<HTMLElement>("[data-indexer-nav]").forEach((el) => {
    el.style.display = visible ? "" : "none";
  });
  _syncTabSelectWithNav();
}
