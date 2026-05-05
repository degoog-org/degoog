import type { ScoredResult, SearchResponse } from "../../types";
import { getBase } from "../base-url";
import { state } from "../../state";
import { getEngines } from "../engines";
import { renderMediaEngineBar } from "../../modules/renderer/render-media";
import { renderSidebar, renderResults } from "../../modules/renderer/render";
import { performSearch } from "./search-actions-perform";
import { searchAuthHeaders, appendSearchAuthParams } from "../request";

export async function retryEngine(engineName: string): Promise<void> {
  if (!state.currentQuery || !state.currentData) return;

  const engines = await getEngines();
  const params = new URLSearchParams({
    q: state.currentQuery,
    engine: engineName,
  });
  for (const [key, val] of Object.entries(engines)) {
    params.set(key, String(val));
  }
  if (state.currentType && state.currentType !== "web") {
    params.set("type", state.currentType);
  }
  if (state.currentPage > 1) {
    params.set("page", String(state.currentPage));
  }
  if (state.currentTimeFilter && state.currentTimeFilter !== "any") {
    params.set("time", state.currentTimeFilter);
  }

  try {
    const res = state.postMethodEnabled
      ? await fetch(`${getBase()}/api/search/retry`, {
          method: "POST",
          body: JSON.stringify({
            query: state.currentQuery,
            engine: engineName,
            engines: Object.entries(engines)
              .filter(([, v]) => v)
              .map(([k]) => k),
            type: state.currentType !== "web" ? state.currentType : undefined,
            page: state.currentPage > 1 ? state.currentPage : undefined,
            time:
              state.currentTimeFilter !== "any"
                ? state.currentTimeFilter
                : undefined,
          }),
          headers: { "Content-Type": "application/json", ...searchAuthHeaders() },
        })
      : await fetch(appendSearchAuthParams(`${getBase()}/api/search/retry?${params.toString()}`));
    const data = (await res.json()) as SearchResponse & {
      results: ScoredResult[];
    };

    if (data.engineTimings && state.currentData) {
      state.currentData.engineTimings = data.engineTimings;
    }

    if (data.results && data.results.length > state.currentResults.length) {
      state.currentResults = data.results;
      if (state.currentData) {
        state.currentData.results = data.results;
      }

      const resultsMeta = document.getElementById("results-meta");
      if (resultsMeta)
        resultsMeta.textContent = `About ${data.results.length} results (${((state.currentData?.totalTime ?? 0) / 1000).toFixed(2)} seconds)`;

      renderResults(data.results);
    }

    const isMediaType =
      state.currentType === "images" || state.currentType === "videos";
    if (isMediaType && state.currentData) {
      renderMediaEngineBar(state.currentData.engineTimings ?? []);
    } else if (state.currentData) {
      renderSidebar(state.currentData, (q) => void performSearch(q));
    }
  } catch {}
}
