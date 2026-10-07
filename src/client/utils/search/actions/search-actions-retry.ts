import {
  isImageSearchType,
  type ScoredResult,
  type SearchResponse,
} from "../../../../shared/search-types";
import { getBase } from "../../net/base-url";
import { isCurrentSearch, state } from "../../../state";
import { getEngines } from "../engines";
import { renderImgEngines } from "../../../modules/filters/image-filters";
import { renderSidebar } from "../../../modules/renderer/sidebar/render-sidebar";
import { renderResults } from "../../../modules/renderer/render";
import { performSearch } from "./search-actions-perform";
import { buildSearchBody, buildSearchParams } from "../../net/url";
import {
  currentSearchImage,
  withSearchImage,
} from "../../../modules/search-image/search-image";
import { searchAuthHeaders, appendSearchAuthParams } from "../../net/request";
import { infiniteScrollOn } from "../streaming/streaming-config";
import { mergeEngineTimings, mergeScoredResults } from "../engine-stats/engine-stats";

const t = window.scopedT("themes/degoog");

export async function retryEngine(
  engineName: string,
  page = state.currentPage,
): Promise<void> {
  if ((!state.currentQuery && !currentSearchImage()) || !state.currentData) return;
  const seq = state.searchSeq;

  const engines = await getEngines();
  if (!isCurrentSearch(seq)) return;
  const params = buildSearchParams(state.currentQuery, engines, state.currentType, page);
  params.set("engine", engineName);

  try {
    const res = state.postMethodEnabled || currentSearchImage()
      ? await fetch(`${getBase()}/api/search/retry`, {
          method: "POST",
          body: JSON.stringify({
            ...withSearchImage(
              buildSearchBody(state.currentQuery, engines, state.currentType, page),
            ),
            engine: engineName,
          }),
          headers: { "Content-Type": "application/json", ...searchAuthHeaders() },
        })
      : await fetch(appendSearchAuthParams(`${getBase()}/api/search/retry?${params.toString()}`));
    if (!res.ok) {
      console.warn("[search] engine retry failed", res.status);
      return;
    }
    const data = (await res.json()) as SearchResponse & {
      results: ScoredResult[];
      timing?: SearchResponse["engineTimings"][number];
    };
    if (!isCurrentSearch(seq)) return;

    const infinite = infiniteScrollOn() && !isImageSearchType(state.currentType);
    if (state.currentData) {
      state.currentData.engineTimings = infinite && data.timing
        ? mergeEngineTimings(state.currentData.engineTimings, [data.timing], page)
        : data.engineTimings;
    }

    if (data.results && (data.results.length > state.currentResults.length || infinite)) {
      state.currentResults = infinite
        ? mergeScoredResults(state.currentResults, data.results)
        : data.results;
      if (state.currentData) {
        state.currentData.results = state.currentResults;
      }

      const resultsMeta = document.getElementById("results-meta");
      if (resultsMeta)
        resultsMeta.textContent = t("search-templates.status.done", {
          count: String(state.currentResults.length),
          time: ((state.currentData?.totalTime ?? 0) / 1000).toFixed(2),
        });

      renderResults(state.currentResults, { paginate: !infinite });
    }

    const isMediaType = isImageSearchType(state.currentType);
    if (isMediaType && state.currentData) {
      renderImgEngines(state.currentData.engineTimings ?? []);
    } else if (state.currentData) {
      renderSidebar(state.currentData, (q) => void performSearch(q));
    }
  } catch (err) {
    console.warn("[search] engine retry failed", err);
  }
}
