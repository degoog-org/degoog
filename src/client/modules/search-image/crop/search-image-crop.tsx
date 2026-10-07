import { render } from "../../../../shared/ui/tribute/dom";
import { cropSearchDataUrl } from "../search-image-prepare";
import { newSearchImageId, type SearchImage } from "../search-image-store";
import {
  drawRect,
  FULL_CROP,
  isFullCrop,
  moveRect,
  resizeRect,
  STARTING_CROP,
  type CropEdges,
  type CropRect,
} from "./crop-geometry";
import { SearchImageCropDialog, type CropHandle } from "./search-image-crop-dialog";

const t = window.scopedT("core");

const MIN_SIDE_PX = 32;
const KEY_STEP = 0.01;
const KEY_STEP_BIG = 0.05;
const DRAG_CLASS = "degoog-search-image-crop-dragging";

const KEY_DELTA: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

type Drag =
  | { mode: "move" }
  | { mode: "resize"; edges: CropEdges }
  | { mode: "draw" };

interface DragStart {
  drag: Drag;
  pointerId: number;
  x: number;
  y: number;
  rect: CropRect;
}

const _edgesOf = (handle: CropHandle): CropEdges => ({
  left: handle.includes("w"),
  right: handle.includes("e"),
  top: handle.startsWith("n"),
  bottom: handle.startsWith("s"),
});

const _sameRect = (a: CropRect, b: CropRect): boolean =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const _cropped = async (
  image: SearchImage,
  source: string,
  rect: CropRect,
): Promise<SearchImage> => {
  if (image.crop ? _sameRect(image.crop, rect) : isFullCrop(rect)) return image;
  if (isFullCrop(rect)) return { id: newSearchImageId(), dataUrl: source };
  return {
    id: newSearchImageId(),
    dataUrl: await cropSearchDataUrl(source, rect),
    source,
    crop: rect,
  };
};

export const cropSearchImage = (image: SearchImage): Promise<SearchImage | null> =>
  new Promise((resolve) => {
    const source = image.source ?? image.dataUrl;
    let rect: CropRect = image.crop ?? STARTING_CROP;
    let start: DragStart | null = null;
    let result: SearchImage | null = null;
    let busy = false;

    const host = document.createElement("div");
    document.body.appendChild(host);

    const close = (): void => dialog.close();

    const search = async (): Promise<void> => {
      if (busy) return;
      busy = true;
      searchBtn.disabled = true;
      try {
        result = await _cropped(image, source, rect);
      } catch (err) {
        console.error("[search-image] could not crop the image", err);
        result = null;
      }
      close();
    };

    render(
      <SearchImageCropDialog
        src={source}
        title={t("search-image.crop-title")}
        hint={t("search-image.crop-hint")}
        boxLabel={t("search-image.crop-area")}
        resetLabel={t("search-image.crop-reset")}
        cancelLabel={t("search-image.crop-cancel")}
        searchLabel={t("search-image.crop-search")}
        onReset={() => paint(FULL_CROP)}
        onCancel={close}
        onSearch={() => void search()}
      />,
      host,
    );

    const dialog = host.querySelector("dialog") as HTMLDialogElement;
    const stage = dialog.querySelector(".degoog-search-image-crop-stage") as HTMLElement;
    const img = dialog.querySelector(".degoog-search-image-crop-img") as HTMLImageElement;
    const box = dialog.querySelector(".degoog-search-image-crop-box") as HTMLElement;
    const size = dialog.querySelector(".degoog-search-image-crop-size") as HTMLElement;
    const resetBtn = dialog.querySelector(".degoog-search-image-crop-reset") as HTMLButtonElement;
    const searchBtn = dialog.querySelector(".degoog-search-image-crop-search") as HTMLButtonElement;

    const minSide = (): [number, number] => [
      Math.min(1, MIN_SIDE_PX / Math.max(1, stage.clientWidth)),
      Math.min(1, MIN_SIDE_PX / Math.max(1, stage.clientHeight)),
    ];

    function paint(next: CropRect): void {
      rect = next;
      box.style.left = `${rect.x * 100}%`;
      box.style.top = `${rect.y * 100}%`;
      box.style.width = `${rect.w * 100}%`;
      box.style.height = `${rect.h * 100}%`;
      size.textContent = img.naturalWidth
        ? `${Math.round(rect.w * img.naturalWidth)} × ${Math.round(rect.h * img.naturalHeight)}`
        : "";
      resetBtn.disabled = isFullCrop(rect);
    }

    const pointOf = (e: PointerEvent): [number, number] => {
      const bounds = stage.getBoundingClientRect();
      return [
        (e.clientX - bounds.left) / Math.max(1, bounds.width),
        (e.clientY - bounds.top) / Math.max(1, bounds.height),
      ];
    };

    const dragOf = (target: EventTarget | null): Drag => {
      const el = target instanceof Element ? target : null;
      const handle = el?.closest<HTMLElement>("[data-handle]")?.dataset.handle as
        | CropHandle
        | undefined;
      if (handle) return { mode: "resize", edges: _edgesOf(handle) };
      if (el && box.contains(el) && !isFullCrop(rect)) return { mode: "move" };
      return { mode: "draw" };
    };

    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || start) return;
      e.preventDefault();
      const [x, y] = pointOf(e);
      start = { drag: dragOf(e.target), pointerId: e.pointerId, x, y, rect };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add(DRAG_CLASS);
      box.focus({ preventScroll: true });
      if (start.drag.mode === "draw") {
        const [minW, minH] = minSide();
        paint(drawRect(x, y, x, y, minW, minH));
      }
    });

    stage.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.pointerId) return;
      const [x, y] = pointOf(e);
      const [minW, minH] = minSide();
      const { drag } = start;
      if (drag.mode === "move") paint(moveRect(start.rect, x - start.x, y - start.y));
      else if (drag.mode === "resize")
        paint(resizeRect(start.rect, drag.edges, x - start.x, y - start.y, minW, minH));
      else paint(drawRect(start.x, start.y, x, y, minW, minH));
    });

    const endDrag = (e: PointerEvent): void => {
      if (!start || e.pointerId !== start.pointerId) return;
      start = null;
      stage.classList.remove(DRAG_CLASS);
      if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);

    box.addEventListener("dblclick", () => paint(FULL_CROP));

    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void search();
        return;
      }
      const delta = KEY_DELTA[e.key];
      if (!delta) return;
      e.preventDefault();
      const step = e.altKey ? KEY_STEP_BIG : KEY_STEP;
      const [dx, dy] = [delta[0] * step, delta[1] * step];
      if (!e.shiftKey) {
        paint(moveRect(rect, dx, dy));
        return;
      }
      const [minW, minH] = minSide();
      paint(
        resizeRect(rect, { left: false, top: false, right: true, bottom: true }, dx, dy, minW, minH),
      );
    });

    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) close();
    });

    dialog.addEventListener("close", () => {
      host.remove();
      resolve(result);
    });

    paint(rect);
    if (!img.complete) img.addEventListener("load", () => paint(rect), { once: true });
    dialog.showModal();
  });
