export interface ProxyTestMessageProps {
  title: string;
  detail: string;
  hint?: string;
  breakAfterTitle: boolean;
}

export const ProxyTestMessage = ({
  title,
  detail,
  hint,
  breakAfterTitle,
}: ProxyTestMessageProps): JSX.Element => (
  <>
    <strong>{title}</strong>
    {breakAfterTitle ? <br /> : " "}
    {detail}
    {hint ? (
      <>
        <br />
        {hint}
      </>
    ) : null}
  </>
);
