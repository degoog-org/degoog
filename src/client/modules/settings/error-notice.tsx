const t = window.scopedT("core");

export const ErrorNotice = ({ messageKey }: { messageKey: string }): JSX.Element => (
  <p>{t(messageKey)}</p>
);
