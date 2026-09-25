export const UuidList = ({
  uuids,
  copyLabel,
}: {
  uuids: string[];
  copyLabel?: string;
}): JSX.Element => (
  <div class="command-result command-uuid">
    {uuids.map((uuid) => (
      <div key={uuid} class="uuid-row">
        <code class="uuid-value">{uuid}</code>
        {copyLabel ? (
          <button type="button" class="uuid-copy" data-uuid={uuid}>
            {copyLabel}
          </button>
        ) : null}
      </div>
    ))}
  </div>
);
