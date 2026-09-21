export const FieldLabel = ({ htmlFor, text }: { htmlFor: string; text: string }): JSX.Element => (
  <label for={htmlFor} class="settings-proxy-urls-label">
    {text}
  </label>
);
