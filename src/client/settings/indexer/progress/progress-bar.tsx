export const IndexerProgressBar = (): JSX.Element => (
  <>
    <div
      class="degoog-progress"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow="0"
    >
      <div class="degoog-progress-fill"></div>
    </div>
    <span class="degoog-progress-label"></span>
  </>
);
