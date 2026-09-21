export const DragHandle = ({ label }: { label: string }): JSX.Element => (
  <span
    class="degoog-drag-handle"
    data-drag-handle={true}
    tabindex="0"
    role="button"
    title={label}
    aria-label={label}
  >
    <i class="fa-solid fa-grip-vertical"></i>
  </span>
);
