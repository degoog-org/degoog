export const CommandGlance = ({
  snippet,
  resultCount,
}: {
  snippet?: string;
  resultCount: number;
}): JSX.Element => (
  <div class="command-result">
    {snippet ? (
      <div class="glance-box">
        <div class="glance-snippet">{snippet}</div>
      </div>
    ) : null}
    <p class="natural-command-meta">{`${resultCount} results from engine`}</p>
  </div>
);
