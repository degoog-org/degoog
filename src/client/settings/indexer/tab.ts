import type { IndexerStats } from "../../../shared/indexer";
import { openClearModal } from "./modals/clear-modal";
import { openExportModal } from "./modals/export-modal";
import { openImportModal } from "./modals/import-modal";
import { openManageModal } from "./modals/manage-modal";
import { renderShell } from "./shell/shell";
import { fetchStats, renderStats } from "./stats";
import { wireToggles } from "./toggles";

export const initIndexerTab = async (container: HTMLElement): Promise<void> => {
  renderShell(container);

  let _lastStats: IndexerStats | null = null;

  const refreshStats = async (): Promise<void> => {
    const stats = await fetchStats();
    if (stats) {
      _lastStats = stats;
      renderStats(stats);
    }
  };

  const applyVisibility = await wireToggles(refreshStats);

  const masterEl = document.getElementById(
    "settings-degoog-indexer-enabled",
  ) as HTMLInputElement | null;
  masterEl?.addEventListener("change", () => {
    applyVisibility(masterEl.checked);
    if (masterEl.checked) void refreshStats();
  });

  document
    .getElementById("indexer-manage-btn")
    ?.addEventListener("click", () => openManageModal(_lastStats, refreshStats));

  document
    .getElementById("indexer-export-btn")
    ?.addEventListener("click", () => openExportModal(_lastStats));

  document
    .getElementById("indexer-import-btn")
    ?.addEventListener("click", () => { void openImportModal(refreshStats); });

  document
    .getElementById("indexer-clear-btn")
    ?.addEventListener("click", () => openClearModal(refreshStats));
};
