let _scale = 1;
let _tx = 0;
let _ty = 0;
let _dragging = false;
let _hasDragged = false;
let _dragStartX = 0;
let _dragStartY = 0;
let _dragStartTX = 0;
let _dragStartTY = 0;

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const ZOOM_FACTOR = 1.15;

const _applyTransform = (img: HTMLImageElement): void => {
  img.style.transform = `translate(${_tx}px, ${_ty}px) scale(${_scale})`;
};

const _reset = (img: HTMLImageElement, wrap: HTMLElement): void => {
  _scale = 1;
  _tx = 0;
  _ty = 0;
  _applyTransform(img);
  wrap.style.cursor = "zoom-in";
};

export const openLightbox = (src: string): void => {
  const lb = document.getElementById("img-lightbox");
  const img = document.getElementById("img-lightbox-img") as HTMLImageElement | null;
  const wrap = document.getElementById("img-lightbox-wrap");
  if (!lb || !img || !wrap) return;
  img.src = src;
  _reset(img, wrap);
  lb.classList.add("open");
};

export const closeLightbox = (): void => {
  const lb = document.getElementById("img-lightbox");
  const img = document.getElementById("img-lightbox-img") as HTMLImageElement | null;
  if (!lb || !img) return;
  lb.classList.remove("open");
  img.src = "";
};

export const initLightbox = (): void => {
  const lb = document.getElementById("img-lightbox");
  const img = document.getElementById("img-lightbox-img") as HTMLImageElement | null;
  const wrap = document.getElementById("img-lightbox-wrap");
  if (!lb || !img || !wrap) return;

  document.getElementById("img-lightbox-close")?.addEventListener("click", closeLightbox);
  document.getElementById("img-lightbox-bg")?.addEventListener("click", closeLightbox);

  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
  });

  wrap.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, _scale * factor));
    if (newScale === _scale) return;
    _tx += offsetX * (1 - newScale / _scale);
    _ty += offsetY * (1 - newScale / _scale);
    _scale = newScale;
    if (_scale <= MIN_SCALE) { _tx = 0; _ty = 0; }
    _applyTransform(img);
    wrap.style.cursor = _scale > 1 ? "grab" : "zoom-in";
  }, { passive: false });

  wrap.addEventListener("dblclick", () => _reset(img, wrap));

  wrap.addEventListener("mousedown", (e) => {
    if (_scale <= 1 || e.button !== 0) return;
    e.preventDefault();
    _dragging = true;
    _hasDragged = false;
    _dragStartX = e.clientX;
    _dragStartY = e.clientY;
    _dragStartTX = _tx;
    _dragStartTY = _ty;
    wrap.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (e) => {
    if (!_dragging) return;
    if (Math.abs(e.clientX - _dragStartX) > 3 || Math.abs(e.clientY - _dragStartY) > 3) {
      _hasDragged = true;
    }
    _tx = _dragStartTX + (e.clientX - _dragStartX);
    _ty = _dragStartTY + (e.clientY - _dragStartY);
    _applyTransform(img);
  });

  window.addEventListener("mouseup", () => {
    if (!_dragging) return;
    _dragging = false;
    wrap.style.cursor = _scale > 1 ? "grab" : "zoom-in";
  });

  wrap.addEventListener("click", () => {
    if (_hasDragged) { _hasDragged = false; return; }
    if (_scale > 1) return;
    closeLightbox();
  });
};
