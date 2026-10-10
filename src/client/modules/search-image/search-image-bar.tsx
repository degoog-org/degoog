import { clear, render } from "../../../shared/ui/tribute/dom";
import { cropSearchImage } from "./crop/search-image-crop";
import { SearchImageChip } from "./search-image-chip";
import { SearchImageDropzone } from "./search-image-dropzone";
import { SearchImagePickButton } from "./search-image-pick-button";
import { firstImageFile, isImageFile, toSearchDataUrl } from "./search-image-prepare";
import { newSearchImageId, type SearchImage } from "./search-image-store";

const t = window.scopedT("core");

export const HOME_INPUT_ID = "search-input";
export const RESULTS_INPUT_ID = "results-search-input";

const HAS_IMAGE_CLASS = "degoog-search-image-attached";
const OVER_CLASS = "degoog-search-image-over";
const DRAGGING_CLASS = "degoog-search-image-dragging";
const TOAST_CLASS = "degoog-search-image-toast";
const TOAST_MS = 3500;
const DRAG_IDLE_MS = 180;

interface BarSlot {
  bar: HTMLElement;
  input: HTMLInputElement;
  chip: HTMLElement;
  placeholder: string;
  image: SearchImage | null;
}

const _slots = new Map<string, BarSlot>();
let _dragTimer = 0;
let _submit: ((inputId: string) => void) | null = null;

export function onSearchImageSubmit(fn: (inputId: string) => void): void {
  _submit = fn;
}

const _slotFor = (node: EventTarget | null): BarSlot | null => {
  const bar = node instanceof Element ? node.closest(".degoog-search-bar") : null;
  return [..._slots.values()].find((slot) => slot.bar === bar) ?? null;
};

const _pageSlot = (): BarSlot | null =>
  _slots.get(RESULTS_INPUT_ID) ?? _slots.get(HOME_INPUT_ID) ?? null;

function _toast(slot: BarSlot, message: string): void {
  slot.bar.querySelector(`.${TOAST_CLASS}`)?.remove();
  const node = document.createElement("div");
  node.className = TOAST_CLASS;
  node.setAttribute("role", "status");
  node.textContent = message;
  slot.bar.appendChild(node);
  setTimeout(() => node.remove(), TOAST_MS);
}

function _paint(slot: BarSlot): void {
  slot.bar.classList.toggle(HAS_IMAGE_CLASS, !!slot.image);
  slot.input.placeholder = slot.image ? t("search-image.refine") : slot.placeholder;
  if (!slot.image) {
    clear(slot.chip);
    return;
  }
  render(
    <SearchImageChip
      src={slot.image.dataUrl}
      cropLabel={t("search-image.crop")}
      removeLabel={t("search-image.remove")}
      onCrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void _crop(slot);
      }}
      onRemove={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setBarImage(slot.input.id, null);
        slot.input.focus();
      }}
    />,
    slot.chip,
  );
}

async function _crop(slot: BarSlot): Promise<void> {
  const image = slot.image;
  if (!image) return;
  const next = await cropSearchImage(image);
  if (!next || slot.image?.id !== image.id) {
    slot.input.focus();
    return;
  }
  setBarImage(slot.input.id, next);
  _submit?.(slot.input.id);
}

export const barImage = (inputId: string): SearchImage | null =>
  _slots.get(inputId)?.image ?? null;

export function setBarImage(inputId: string, image: SearchImage | null): void {
  const slot = _slots.get(inputId);
  if (!slot) return;
  slot.image = image;
  _paint(slot);
}

async function _attachFile(slot: BarSlot, file: File | null): Promise<void> {
  if (!isImageFile(file)) {
    _toast(slot, t("search-image.not-image"));
    return;
  }
  try {
    const dataUrl = await toSearchDataUrl(file);
    setBarImage(slot.input.id, { id: newSearchImageId(), dataUrl });
    slot.input.focus();
  } catch (err) {
    console.error("[search-image] could not read the image", err);
    _toast(slot, t("search-image.read-failed"));
  }
}

function _pick(slot: BarSlot): void {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/*";
  picker.addEventListener("change", () => void _attachFile(slot, picker.files?.[0] ?? null));
  picker.click();
}

const _hasFiles = (dt: DataTransfer | null): boolean =>
  !!dt && Array.from(dt.types ?? []).includes("Files");

function _endDrag(): void {
  document.body.classList.remove(DRAGGING_CLASS);
  _slots.forEach((slot) => slot.bar.classList.remove(OVER_CLASS));
}

function _onDragOver(e: DragEvent): void {
  if (!_hasFiles(e.dataTransfer)) return;
  e.preventDefault();
  document.body.classList.add(DRAGGING_CLASS);
  const over = _slotFor(e.target);
  _slots.forEach((slot) => slot.bar.classList.toggle(OVER_CLASS, slot === over));
  clearTimeout(_dragTimer);
  _dragTimer = window.setTimeout(_endDrag, DRAG_IDLE_MS);
}

function _onDrop(e: DragEvent): void {
  if (!_hasFiles(e.dataTransfer)) return;
  const slot = _slotFor(e.target) ?? _pageSlot();
  if (!slot) return;
  e.preventDefault();
  e.stopPropagation();
  _endDrag();
  void _attachFile(slot, firstImageFile(e.dataTransfer?.files ?? []));
}

function _onPaste(e: ClipboardEvent): void {
  const slot = _slotFor(e.target);
  if (!slot) return;
  const file = firstImageFile(
    Array.from(e.clipboardData?.items ?? []).map((item) => item.getAsFile()),
  );
  if (!file) return;
  e.preventDefault();
  void _attachFile(slot, file);
}

function _mount(inputId: string): void {
  const input = document.getElementById(inputId) as HTMLInputElement | null;
  const bar = input?.closest<HTMLElement>(".degoog-search-bar");
  if (!input || !bar || _slots.has(inputId)) return;
  const chip = document.createElement("span");
  chip.className = "degoog-search-image-chip-host";
  input.before(chip);
  const pick = document.createElement("span");
  pick.className = "degoog-search-image-pick-host";
  (bar.querySelector(".search-bar-actions") ?? input).after(pick);
  const zone = document.createElement("div");
  zone.className = "degoog-search-image-zone-host";
  bar.appendChild(zone);
  const slot: BarSlot = { bar, input, chip, placeholder: input.placeholder, image: null };
  _slots.set(inputId, slot);
  render(
    <SearchImagePickButton label={t("search-image.pick")} onClick={() => _pick(slot)} />,
    pick,
  );
  render(
    <SearchImageDropzone
      title={t("search-image.drop-title")}
      hint={t("search-image.drop-hint")}
    />,
    zone,
  );
}

export function pickSearchImage(): void {
  const slot = _pageSlot();
  if (slot) _pick(slot);
}

export const mountSearchImageBars = (): boolean => {
  if (_slots.size > 0) return false;
  _mount(HOME_INPUT_ID);
  _mount(RESULTS_INPUT_ID);
  if (_slots.size === 0) return false;
  document.addEventListener("dragover", _onDragOver, true);
  document.addEventListener("drop", _onDrop, true);
  document.addEventListener("paste", _onPaste, true);
  return true;
};
