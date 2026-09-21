const ENV_VAR = /DEGOOG_[A-Z_]+(?:=[A-Za-z0-9]+)?/g;

export const GateNote = ({ text }: { text: string }): JSX.Element => {
  const parts: JSX.Element[] = [];
  let at = 0;
  for (const match of text.matchAll(ENV_VAR)) {
    const start = match.index;
    if (start > at) parts.push(<>{text.slice(at, start)}</>);
    parts.push(<code>{match[0]}</code>);
    at = start + match[0].length;
  }
  if (at < text.length) parts.push(<>{text.slice(at)}</>);

  return (
    <div class="settings-auth-note" role="note">
      <p class="settings-auth-note-text">{parts}</p>
    </div>
  );
};
