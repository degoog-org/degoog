export type {
  SearchResult,
  ScoredResult,
  EngineTiming,
  SlotPanel,
  SearchResponse,
} from "../../shared/search-types";
export { SlotPanelPosition } from "../../shared/search-types";

export enum ImgColor {
  ANY = "any",
  BLACK = "black",
  BLUE = "blue",
  BROWN = "brown",
  GRAY = "gray",
  GREEN = "green",
  MONOCHROME = "monochrome",
  ORANGE = "orange",
  PINK = "pink",
  PURPLE = "purple",
  RED = "red",
  TEAL = "teal",
  TRANSPARENT = "transparent",
  WHITE = "white",
  YELLOW = "yellow",
}

export enum ImgSize {
  ANY = "any",
  LARGE = "large",
  MEDIUM = "medium",
  SMALL = "small",
  WALLPAPER = "wallpaper",
}

export enum ImgType {
  ANIMATED = "animated",
  ANY = "any",
  CLIPART = "clipart",
  LINEART = "lineart",
  PHOTO = "photo",
  TRANSPARENT = "transparent",
}

export enum ImgLayout {
  ANY = "any",
  SQUARE = "square",
  TALL = "tall",
  WIDE = "wide",
}

export enum ImgNsfw {
  ANY = "any",
  MODERATE = "moderate",
  OFF = "off",
  ON = "on",
}

export interface ImageFilter {
  color?: ImgColor;
  size?: ImgSize;
  type?: ImgType;
  layout?: ImgLayout;
  nsfw?: ImgNsfw;
}

export interface SearchBody {
  query: string;
  engines: string[];
  type?: string;
  page?: number;
  time?: string;
  dateFrom?: string;
  dateTo?: string;
  lang?: string;
  imgColor?: string;
  imgSize?: string;
  imgType?: string;
  imgLayout?: string;
  safeMode?: string;
  /** @deprecated use safeMode; still read for old bookmarks/clients. */
  imgNsfw?: string;
}

export interface RetryPostBody extends SearchBody {
  engine: string;
}

export interface SuggestPostBody {
  query: string;
}

export interface SearchParams {
  query: string;
  engines: EngineConfig;
  searchType: SearchType;
  page: number;
  timeFilter: TimeFilter;
  lang: string;
  dateFrom: string;
  dateTo: string;
  imageFilter?: ImageFilter;
}

export type SearchType = string;

export type TimeFilter =
  | "any"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year"
  | "custom";
export type EngineConfig = Record<string, boolean>;

export type EngineFetch = (
  url: string,
  options?: {
    headers?: Record<string, string>;
    redirect?: RequestRedirect;
    signal?: AbortSignal;
  },
) => Promise<Response>;

export interface EngineContext {
  fetch: EngineFetch;
  searchType?: SearchType;
  lang?: string;
  dateFrom?: string;
  dateTo?: string;
  buildAcceptLanguage?: () => string;
  userAgent?: () => string;
  extractImageUrl?: (
    $el: unknown,
    baseUrl?: string,
    selectors?: string[],
  ) => string;
  signProxyUrl?: (url: string) => string;
  imageFilter?: ImageFilter;
  sentinel?: (
    response: { ok: boolean; status: number },
    engineName?: string,
  ) => void;
  engineError?: (
    status: string,
    message: string,
    opts?: { httpStatus?: number; engine?: string },
  ) => Error;
}
