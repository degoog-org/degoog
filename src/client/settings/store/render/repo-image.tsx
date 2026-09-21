export interface RepoImageProps {
  src: string;
  alt?: string;
}

export const RepoImage = ({ src, alt }: RepoImageProps): JSX.Element =>
  src ? (
    <img src={src} alt={alt ?? ""} class="store-repo-img" loading="lazy" />
  ) : (
    <div class="store-repo-img store-repo-img-placeholder"></div>
  );
