const t = window.scopedT("core");

export const SubHeading = ({ k }: { k: string }): JSX.Element => (
  <h3 class="settings-subheading">{t(k)}</h3>
);
