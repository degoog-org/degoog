import { render } from "../../../shared/ui/core/dom";
import { IndexerProgressBar } from "./progress-bar";
export interface ProgressUi {
  set: (done: number, total: number) => void;
  label: (text: string) => void;
  finish: (failed?: boolean) => void;
}

const pct = (done: number, total: number): number =>
  total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

export const mountProgress = (host: HTMLElement): ProgressUi => {
  render(<IndexerProgressBar />, host);

  const bar = host.querySelector<HTMLElement>(".degoog-progress");
  const fill = host.querySelector<HTMLElement>(".degoog-progress-fill");
  const label = host.querySelector<HTMLElement>(".degoog-progress-label");

  return {
    set: (done, total) => {
      const value = pct(done, total);
      if (fill) fill.style.width = `${value}%`;
      if (bar) bar.setAttribute("aria-valuenow", String(value));
    },
    label: (text) => {
      if (label) label.textContent = text;
    },
    finish: (failed) => {
      if (!fill) return;
      fill.style.width = "100%";
      fill.classList.add(failed ? "degoog-progress-fill--failed" : "degoog-progress-fill--done");
    },
  };
};
