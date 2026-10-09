const t = window.scopedT("core");

export const createFieldSaveBtn = (): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "settings-field-save-btn";
  btn.hidden = true;
  btn.textContent = t("settings-page.actions.save");
  return btn;
};

export const placeFieldSaveBtn = (field: HTMLElement, btn: HTMLButtonElement): void => {
  const row = field.closest(".settings-row");
  if (row) row.append(btn);
  else field.insertAdjacentElement("afterend", btn);
};

const _revisions = new WeakMap<HTMLButtonElement, number>();

export const markFieldDirty = (btn: HTMLButtonElement): void => {
  _revisions.set(btn, (_revisions.get(btn) ?? 0) + 1);
  btn.hidden = false;
};

export const bindFieldSaveBtn = (
  btn: HTMLButtonElement,
  save: () => Promise<boolean>,
): void => {
  btn.addEventListener("click", async () => {
    const prev = btn.textContent ?? "";
    const revision = _revisions.get(btn) ?? 0;
    btn.disabled = true;
    const ok = await save();
    if (ok) {
      btn.textContent = t("settings-page.server.saved");
      setTimeout(() => {
        if ((_revisions.get(btn) ?? 0) === revision) btn.hidden = true;
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
