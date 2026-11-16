import { state } from "../../../state";
import { buildSearchBody, buildSearchUrl } from "../../net/url";
import { appendSearchAuthParams, searchAuthHeaders } from "../../net/request";
import { getBase } from "../../net/base-url";
import {
  currentSearchImage,
  withSearchImage,
} from "../../../modules/search-image/search-image";
import { FetchEventStream, type SearchEventSource } from "./fetch-event-stream";
import type { SearchUiConfig } from "./streaming-config";

const TAB_TYPE_PREFIX = "tab:";

const _postsSearch = (): boolean => state.postMethodEnabled || !!currentSearchImage();

export const openSearchStream = (
  query: string,
  engines: Record<string, boolean>,
  type: string,
  page: number,
): SearchEventSource =>
  _postsSearch()
    ? new FetchEventStream(`${getBase()}/api/search/stream`, {
        body: withSearchImage(buildSearchBody(query, engines, type, page)),
        headers: searchAuthHeaders(),
      })
    : new FetchEventStream(
        appendSearchAuthParams(
          buildSearchUrl(query, engines, type, page).replace(
            "/api/search?",
            "/api/search/stream?",
          ),
        ),
      );

export const streamsProgressively = (config: SearchUiConfig, type: string): boolean =>
  config.enabled &&
  !config.disabledTypes.includes(type) &&
  (!state.postMethodEnabled || !!currentSearchImage());

export const canStreamPages = (): boolean =>
  !state.currentBangQuery && !state.currentType.startsWith(TAB_TYPE_PREFIX);
