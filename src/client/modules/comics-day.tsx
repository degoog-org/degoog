import { clear, render } from "../../shared/ui/tribute/dom";
import { getBase } from "../utils/net/base-url";
import { ComicsBanner } from "./comics-banner";

const COMICS_IMAGE_PATH = "/public/images/degoog-comics.svg";
const COMICS_MONTH_INDEX = 8;
const COMICS_DAY_OF_MONTH = 25;
const GREETING_KEY = "index-templates.header.comics-greeting";

const _isComicsDay = (now: Date): boolean =>
  now.getMonth() === COMICS_MONTH_INDEX &&
  now.getDate() === COMICS_DAY_OF_MONTH;

const _imageUrl = (): string => `${getBase()}${COMICS_IMAGE_PATH}`;

function _replaceHomeLogo(home: Element, greeting: string): void {
  const width = home.querySelector(".logo")?.getBoundingClientRect().width ?? 0;
  clear(home);
  render(
    <ComicsBanner
      src={_imageUrl()}
      alt={greeting}
      greeting={greeting}
      width={width}
    />,
    home,
  );
}

function _replaceResultsLogo(resultsLogo: Element, greeting: string): void {
  clear(resultsLogo);
  render(
    <img
      class="comics-day-image comics-day-image--results"
      src={_imageUrl()}
      alt={greeting}
    />,
    resultsLogo,
  );
}

export function initComicsDay(): void {
  if (!_isComicsDay(new Date())) return;
  const greeting = window.scopedT("themes/degoog")(GREETING_KEY);
  const home = document.getElementById("home-logo");
  const resultsLogo = document.querySelector(".results-logo");
  if (home) _replaceHomeLogo(home, greeting);
  if (resultsLogo) _replaceResultsLogo(resultsLogo, greeting);
}
