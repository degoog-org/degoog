import { clear, render } from "../../../../shared/ui/tribute/dom";
import { IndexerShell } from "./indexer-shell";

export const renderShell = (container: HTMLElement): void => {
  clear(container);
  render(<IndexerShell />, container);
};
