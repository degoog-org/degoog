export const COMICS_CREDIT = "by pmc";

export const ComicsBanner = ({
  src,
  alt,
  greeting,
  width,
}: {
  src: string;
  alt: string;
  greeting: string;
  width: number;
}): JSX.Element => (
  <div class="comics-day" style={`width:${width}px`}>
    <span class="comics-day-greeting">{greeting}</span>
    <img class="comics-day-image" src={src} alt={alt} />
    <span class="comics-day-credit">{COMICS_CREDIT}</span>
  </div>
);
