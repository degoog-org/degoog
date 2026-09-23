export interface GlanceBoxProps {
  snippet: string;
  url: string;
  title: string;
  foundOn: string;
}

export const GlanceBox = ({ snippet, url, title, foundOn }: GlanceBoxProps): JSX.Element => (
  <div class="glance-box degoog-panel degoog-panel--slot degoog-panel--slot-body-padded degoog-vstack">
    <div class="glance-snippet degoog-text degoog-text--md">{snippet}</div>
    <a class="glance-link degoog-link" href={url} target="_blank">
      {title}
    </a>
    <div class="glance-sources degoog-text degoog-text--sm degoog-text--secondary degoog-text--spaced">
      {foundOn}
    </div>
  </div>
);
