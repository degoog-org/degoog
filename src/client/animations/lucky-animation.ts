import { performLucky } from "../utils/search/search-actions-lucky";

export function initLuckyAnimation(): void {
  const btn = document.getElementById("btn-lucky");
  const inner = document.getElementById("lucky-slot-inner");
  if (!btn || !inner) return;

  const items = inner.children;
  const totalItems = items.length;
  let interval: ReturnType<typeof setInterval> | null = null;
  let stopTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentIdx = 0;

  const ITEM_HEIGHT = 36;

  function setSlotIndex(idx: number): void {
    currentIdx = idx;
    const slot = inner?.parentElement;
    const slotHeight = slot ? slot.clientHeight : ITEM_HEIGHT * totalItems;
    const centerOffset = slotHeight / 2 - (idx + 0.5) * ITEM_HEIGHT;
    if (inner) inner.style.transform = `translateY(${centerOffset}px)`;
  }

  function clearSpin(): void {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (stopTimeout) {
      clearTimeout(stopTimeout);
      stopTimeout = null;
    }
  }

  function spinThenStop(): void {
    if (totalItems === 0) return;
    clearSpin();
    btn?.classList.add("hovering");
    currentIdx = 0;
    setSlotIndex(0);
    if (inner) inner.style.transition = "transform 0.12s linear";
    const intervalId = setInterval(() => {
      currentIdx = (currentIdx + 1) % totalItems;
      setSlotIndex(currentIdx);
    }, 80);
    interval = intervalId;
    stopTimeout = setTimeout(() => {
      clearInterval(intervalId);
      interval = null;
      stopTimeout = null;
      const finalIdx = Math.floor(Math.random() * totalItems);
      if (inner) inner.style.transition = "transform 0.2s ease-out";
      setSlotIndex(finalIdx);
    }, 500);
  }

  btn.addEventListener("mouseenter", () => {
    if (interval || stopTimeout) return;
    spinThenStop();
  });

  btn.addEventListener("mouseleave", () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (!stopTimeout) {
      btn.classList.remove("hovering");
      if (inner) {
        inner.style.transition = "";
        setSlotIndex(0);
      }
    }
  });

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    clearSpin();
    btn.classList.remove("hovering");
    if (inner) {
      inner.style.transition = "";
      inner.style.transform = "translateY(0)";
    }
    const searchInput = document.getElementById(
      "search-input",
    ) as HTMLInputElement | null;
    void performLucky(searchInput?.value ?? "");
  });
}
