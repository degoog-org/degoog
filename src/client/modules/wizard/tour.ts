import { switchSettingsTab } from "../settings/settings";
import {
  buildRoot,
  ensureInView,
  placePopover,
  setMaskRects,
  waitFor,
} from "./dom";
import type { WizardStep } from "./steps";

const t = window.scopedT("core");

let active = false;

const countMatches = (selector: string): number =>
  document.querySelectorAll(selector).length;

const tWithCount = (key: string, step: WizardStep): string => {
  if (!step.liveCountSelector) return t(key);
  return t(key, { count: String(countMatches(step.liveCountSelector)) });
};

const applyInteractiveMode = (root: HTMLElement, on: boolean): void => {
  root.classList.toggle("degoog-wizard--interactive", on);
  document.documentElement.classList.toggle(
    "degoog-wizard-open--interactive",
    on,
  );
};

const applyLink = (
  linkEl: HTMLAnchorElement | null,
  step: WizardStep,
): void => {
  if (!linkEl) return;
  if (!step.link) {
    linkEl.hidden = true;
    linkEl.removeAttribute("href");
    linkEl.textContent = "";
    return;
  }
  linkEl.hidden = false;
  linkEl.href = step.link.href;
  linkEl.textContent = t(step.link.labelKey);
};

const isNextBlocked = (step: WizardStep): boolean => {
  if (!step.requireMin || !step.liveCountSelector) return false;
  return countMatches(step.liveCountSelector) < step.requireMin;
};

export const runTour = async (
  steps: readonly WizardStep[],
  onFinish: () => void,
): Promise<void> => {
  if (active) return;
  active = true;
  document.documentElement.classList.add("degoog-wizard-open");
  const root = buildRoot();
  document.body.appendChild(root);

  let index = 0;
  let target: Element | null = null;
  let liveListener: (() => void) | null = null;

  const skipBtn = root.querySelector<HTMLButtonElement>(".degoog-wizard__skip");
  const backBtn = root.querySelector<HTMLButtonElement>(".degoog-wizard__back");
  const nextBtn = root.querySelector<HTMLButtonElement>(".degoog-wizard__next");
  const titleEl = root.querySelector<HTMLElement>(".degoog-wizard__title");
  const bodyEl = root.querySelector<HTMLElement>(".degoog-wizard__body");
  const hintEl = root.querySelector<HTMLElement>(".degoog-wizard__hint");
  const linkEl = root.querySelector<HTMLAnchorElement>(".degoog-wizard__link");
  const progressEl = root.querySelector<HTMLElement>(
    ".degoog-wizard__progress",
  );
  if (skipBtn) skipBtn.textContent = t("settings-page.wizard.skip");

  const clearLiveListener = (): void => {
    if (!liveListener) return;
    window.removeEventListener("extensions-saved", liveListener);
    liveListener = null;
  };

  const cleanupGlobal = (): void => {
    window.removeEventListener("resize", reposition);
    window.removeEventListener("scroll", reposition, true);
    clearLiveListener();
    document.documentElement.classList.remove("degoog-wizard-open");
    document.documentElement.classList.remove(
      "degoog-wizard-open--interactive",
    );
  };

  const teardown = (): void => {
    cleanupGlobal();
    root.remove();
    active = false;
    onFinish();
  };

  const reposition = (): void => {
    const step = steps[index];
    if (!step) return;
    const rect = target ? target.getBoundingClientRect() : null;
    setMaskRects(root, rect);
    placePopover(root, rect, step.popoverAnchor ?? "auto");
  };

  const updateDynamic = (step: WizardStep): void => {
    if (bodyEl) bodyEl.textContent = tWithCount(step.bodyKey, step);
    if (hintEl) {
      const text = step.hintKey ? tWithCount(step.hintKey, step) : "";
      hintEl.textContent = text;
      hintEl.hidden = !text;
    }
    if (nextBtn) nextBtn.disabled = isNextBlocked(step);
  };

  const render = async (): Promise<void> => {
    const step = steps[index];
    if (!step) return teardown();
    clearLiveListener();
    applyInteractiveMode(root, !!step.interactive);
    if (step.tab) switchSettingsTab(step.tab, false);
    target = step.selector ? await waitFor(step.selector) : null;
    if (step.onEnter) await step.onEnter();
    if (target && !step.interactive) await ensureInView(target);
    if (titleEl) titleEl.textContent = t(step.titleKey);
    applyLink(linkEl, step);
    updateDynamic(step);
    if (progressEl)
      progressEl.textContent = t("settings-page.wizard.progress", {
        current: String(index + 1),
        total: String(steps.length),
      });
    if (backBtn) {
      backBtn.textContent = t("settings-page.wizard.back");
      backBtn.style.display = index === 0 ? "none" : "";
    }
    if (nextBtn) {
      nextBtn.textContent =
        index === steps.length - 1
          ? t("settings-page.wizard.done")
          : t("settings-page.wizard.next");
    }
    if (step.liveCountSelector) {
      liveListener = () => updateDynamic(step);
      window.addEventListener("extensions-saved", liveListener);
    }
    reposition();
    requestAnimationFrame(() => nextBtn?.focus());
  };

  skipBtn?.addEventListener("click", teardown);
  backBtn?.addEventListener("click", () => {
    if (index > 0) {
      index--;
      void render();
    }
  });
  nextBtn?.addEventListener("click", () => {
    if (nextBtn.disabled) return;
    const step = steps[index];
    const href = step?.navigateOnNext?.();
    if (href) {
      onFinish();
      cleanupGlobal();
      root.remove();
      active = false;
      window.location.href = href;
      return;
    }
    if (index >= steps.length - 1) return teardown();
    index++;
    void render();
  });

  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);

  await render();
};

export const isTourActive = (): boolean => active;
