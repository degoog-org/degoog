export const WikiThumbnail = ({
  src,
  alt,
  isLogo,
}: {
  src: string;
  alt: string;
  isLogo?: boolean;
}): JSX.Element => (
  <img
    class={isLogo ? "wiki-thumb--logo" : "wiki-thumb"}
    src={src}
    alt={alt}
    loading="lazy"
  />
);
