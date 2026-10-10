const t = window.scopedT("core");

export interface RedirectPreviewProps {
  before: string;
  after: string | null;
  missText: string;
  label?: string;
}

export const RedirectPreview = ({ before, after, missText, label }: RedirectPreviewProps): JSX.Element => (
  <div class="settings-redirect-preview" aria-live="polite">
    {label ? <span class="settings-redirect-preview-label">{label}</span> : null}
    <div class="settings-redirect-preview-line">
      <span class="settings-redirect-preview-tag">{t("settings-page.server.redirect-preview-before")}</span>
      <code class="settings-redirect-preview-url">{before}</code>
    </div>
    <div class="settings-redirect-preview-line">
      <span class="settings-redirect-preview-tag">{t("settings-page.server.redirect-preview-after")}</span>
      {after ? (
        <code class="settings-redirect-preview-url settings-redirect-preview-url--after">{after}</code>
      ) : (
        <span class="settings-redirect-preview-miss">{missText}</span>
      )}
    </div>
  </div>
);
