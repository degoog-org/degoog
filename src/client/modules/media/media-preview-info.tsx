import type { Child } from "../../../shared/ui/core/types";

export interface MediaPreviewInfoProps {
  title: string;
  url: string;
  hostname: string;
  newTab: boolean;
  sources?: string[];
  actions: Child;
}

export const MediaPreviewInfo = ({
  title,
  url,
  hostname,
  newTab,
  sources,
  actions,
}: MediaPreviewInfoProps): JSX.Element => (
  <>
    <h3 class="media-preview-title">{title}</h3>
    <a
      class="media-preview-link"
      href={url}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener" : undefined}
    >
      {hostname}
    </a>
    {sources?.length ? (
      <div class="media-preview-engines">
        {sources.map((source) => (
          <span key={source} class="result-engine-tag degoog-badge">
            {source}
          </span>
        ))}
      </div>
    ) : null}
    <div class="media-preview-actions">{actions}</div>
  </>
);
