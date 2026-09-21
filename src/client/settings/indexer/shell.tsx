import { clear, render } from "../../../shared/ui/core/dom";
import { IndexerShell } from "./indexer-shell";

export const renderShell = (container: HTMLElement): void => {
  clear(container);
  render(<IndexerShell />, container);
};
