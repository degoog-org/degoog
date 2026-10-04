export interface RepoImageProps {
  src: string;
  label?: string;
}

const _initial = (label: string): string =>
  Array.from(label.replace(/[^\p{L}\p{N}]/gu, ""))[0]?.toUpperCase() ?? "";

const _hue = (label: string): number => {
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.codePointAt(0)!) % 360;
  return hash;
};

const _hideBroken = (event: Event): void => {
  (event.currentTarget as HTMLImageElement).hidden = true;
};

export const RepoImage = ({ src, label = "" }: RepoImageProps): JSX.Element => {
  const initial = _initial(label);
  return (
    <div class="store-repo-img" style={`--repo-hue: ${_hue(label)}`}>
      {initial ? (
        <span class="store-repo-img-initial" aria-hidden="true">
          {initial}
        </span>
      ) : (
        <i class="fa-solid fa-puzzle-piece store-repo-img-icon" aria-hidden="true"></i>
      )}
      {src ? <img src={src} alt={label} loading="lazy" onError={_hideBroken} /> : null}
    </div>
  );
};
