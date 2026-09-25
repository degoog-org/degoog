import { buttonClass } from "../../../shared/ui/components/primitives/button";

export const MediaPreviewActions = ({
  url,
  newTab,
  isVideo,
  downloadUrl,
  downloadFilename,
}: {
  url: string;
  newTab: boolean;
  isVideo: boolean;
  downloadUrl?: string;
  downloadFilename?: string;
}): JSX.Element => (
  <>
    <a
      class={buttonClass("primary", "media-preview-visit")}
      href={url}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener" : undefined}
    >
      {isVideo ? "Watch video" : "Visit page"}
    </a>
    {!isVideo && downloadUrl ? (
      <a
        class={buttonClass("secondary", "media-preview-download")}
        href={downloadUrl}
        download={downloadFilename}
      >
        Download
      </a>
    ) : null}
  </>
);
