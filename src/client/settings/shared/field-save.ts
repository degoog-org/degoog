const t = window.scopedT("core");

export const createFieldSaveBtn = (): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "settings-field-save-btn";
  btn.hidden = true;
  btn.textContent = t("settings-page.actions.save");
  return btn;
};

export const bindFieldSaveBtn = (
  btn: HTMLButtonElement,
  save: () => Promise<boolean>,
): void => {
  btn.addEventListener("click", async () => {
    const prev = btn.textContent ?? "";
    btn.disabled = true;
    const ok = await save();
    if (ok) {
      btn.textContent = t("settings-page.server.saved");
      setTimeout(() => {
        btn.hidden = true;
        btn.textContent = prev;
        btn.disabled = false;
      }, 1200);
    } else {
      btn.textContent = t("settings-page.server.save-failed-network");
      btn.disabled = false;
      setTimeout(() => {
        btn.textContent = prev;
      }, 1500);
    }
  });
};
