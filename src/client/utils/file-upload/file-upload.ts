
const DRAG_CLASS = "degoog-file--drag";

export interface FileUploadHandle {
  input: HTMLInputElement;
  file: () => File | null;
  reset: () => void;
}

export const initFileUpload = (
  root: HTMLElement,
  onChange?: (file: File | null) => void,
): FileUploadHandle | null => {
  const zone = root.matches("[data-degoog-file]")
    ? root
    : root.querySelector<HTMLElement>("[data-degoog-file]");
  if (!zone) return null;
  const input = zone.querySelector<HTMLInputElement>(".degoog-file-input");
  const trigger = zone.querySelector<HTMLElement>(".degoog-file-trigger");
  const nameEl = zone.querySelector<HTMLElement>(".degoog-file-name");
  const clearBtn = zone.querySelector<HTMLElement>(".degoog-file-clear");
  if (!input) return null;

  const showFile = (file: File | null): void => {
    if (nameEl) {
      nameEl.textContent = file?.name ?? "";
      nameEl.hidden = !file;
    }
    if (clearBtn) clearBtn.hidden = !file;
  };

  const setFile = (file: File | null): void => {
    showFile(file);
    onChange?.(file);
  };

  trigger?.addEventListener("click", () => input.click());
  input.addEventListener("change", () => setFile(input.files?.[0] ?? null));

  clearBtn?.addEventListener("click", () => {
    input.value = "";
    setFile(null);
  });

  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add(DRAG_CLASS);
  });
  zone.addEventListener("dragleave", (e) => {
    if (e.target === zone) zone.classList.remove(DRAG_CLASS);
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove(DRAG_CLASS);
    const dropped = e.dataTransfer?.files?.[0];
    if (!dropped) return;
    const dt = new DataTransfer();
    dt.items.add(dropped);
    input.files = dt.files;
    setFile(dropped);
  });

  return {
    input,
    file: () => input.files?.[0] ?? null,
    reset: () => {
      input.value = "";
      showFile(null);
    },
  };
};
