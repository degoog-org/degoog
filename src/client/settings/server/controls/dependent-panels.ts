import { setIndexerNavVisible } from "../../indexer/nav";
import { bindDependents, syncDependents } from "../../shared/rows/dependents";
import { el } from "../fields";

const SERVER_CONTENT_ID = "server-content";

export const bindDependentPanels = (): void => {
  const content = document.getElementById(SERVER_CONTENT_ID);
  if (content) bindDependents(content);
};

export const syncDependentPanels = (): void => {
  const content = document.getElementById(SERVER_CONTENT_ID);
  if (content) syncDependents(content);
  setIndexerNavVisible(el("degoog-indexer-enabled")?.checked === true);
};
