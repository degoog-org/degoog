const t = window.scopedT("core");

export const setIndexerNavVisible = (visible: boolean): void => {
  document.querySelectorAll<HTMLElement>("[data-indexer-nav]").forEach((el) => {
    el.style.display = visible ? "" : "none";
  });
  const select = document.getElementById("settings-tab-select");
  let opt = document.getElementById(
    "settings-tab-indexer-option",
  ) as HTMLOptionElement | null;
  if (visible && select && !opt) {
    opt = document.createElement("option");
    opt.id = "settings-tab-indexer-option";
    opt.value = "indexer";
    opt.textContent = t("settings-page.nav.indexer");
    select.appendChild(opt);
  } else if (!visible && opt) {
    opt.remove();
  }
};
