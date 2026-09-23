import type { Child } from "../../tribute/types";

export interface BadgeProps {
  modifier?: string;
  class?: string;
  tooltip?: string;
  children?: Child;
}

export const badgeClass = (modifier?: string, extra?: string): string => {
  const parts = ["degoog-badge"];
  if (modifier) parts.push(`degoog-badge--${modifier}`);
  return extra ? `${extra} ${parts.join(" ")}` : parts.join(" ");
};

export const Badge = ({
  modifier,
  class: extra,
  tooltip,
  children,
}: BadgeProps): JSX.Element => (
  <span class={badgeClass(modifier, extra)} data-tooltip={tooltip}>
    {children}
  </span>
);
