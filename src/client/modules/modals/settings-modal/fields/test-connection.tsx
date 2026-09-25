export const TestConnection = ({
  transport,
  label,
}: {
  transport: string;
  label: string;
}): JSX.Element => (
  <div class="ext-test-connection">
    <button type="button" class="ext-test-btn" data-transport={transport}>
      {label}
    </button>
    <span class="ext-test-result"></span>
  </div>
);
