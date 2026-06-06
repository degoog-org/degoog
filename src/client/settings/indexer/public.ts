import { getBase } from "../../utils/base-url";
import { downloadIndexerExport } from "./download";

const fetchPublicInfo = async (): Promise<string[]> => {
  try {
    const res = await fetch(`${getBase()}/api/indexer/public-info`);
    if (!res.ok) return [];
    const data = (await res.json()) as { available?: boolean; types?: unknown };
    if (!data.available) return [];
    return Array.isArray(data.types) ? (data.types as string[]) : [];
  } catch {
    return [];
  }
};

export const initIndexerPublic = async (): Promise<void> => {
  const section = document.getElementById("indexer-public-section");
  if (!section) return;

  const types = await fetchPublicInfo();
  if (types.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;

  const statusEl = document.getElementById("indexer-public-status");
  const exportBtn = document.getElementById("indexer-public-export-btn");
  const typeSelect = document.getElementById("indexer-public-type") as HTMLSelectElement | null;

  const typeWrap = document.getElementById("indexer-public-type-wrap");
  if (typeSelect) {
    for (const type of types) {
      const opt = document.createElement("option");
      opt.value = type;
      opt.textContent = type;
      typeSelect.append(opt);
    }
    const multiType = types.length > 1;
    typeSelect.hidden = !multiType;
    if (typeWrap) typeWrap.hidden = !multiType;
  }

  exportBtn?.addEventListener("click", async () => {
    const type = typeSelect?.value ?? types[0];
    if (!type) return;
    await downloadIndexerExport(type, { statusEl });
  });
};
