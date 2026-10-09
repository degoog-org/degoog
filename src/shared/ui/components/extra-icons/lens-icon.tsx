interface LensIconProps {
  class?: string;
  size?: number;
}

export const LensIcon = ({ class: extra, size = 20 }: LensIconProps): JSX.Element => (
  <svg
    class={extra ? `degoog-extra-icon ${extra}` : "degoog-extra-icon"}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
    <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
