import type { Child, EventHandler } from "../../core/types";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps {
  variant?: ButtonVariant;
  class?: string;
  id?: string;
  type?: "button" | "submit" | "reset";
  title?: string;
  disabled?: boolean;
  onClick?: EventHandler;
  children?: Child;
  [attribute: string]: unknown;
}

export const buttonClass = (variant: ButtonVariant | undefined, extra?: string): string => {
  const base = variant
    ? `btn btn--${variant} degoog-btn degoog-btn--${variant}`
    : "degoog-btn";
  return extra ? `${base} ${extra}` : base;
};

export const Button = ({
  variant = "secondary",
  class: extra,
  type = "button",
  children,
  ...rest
}: ButtonProps): JSX.Element => (
  <button class={buttonClass(variant, extra)} type={type} {...rest}>
    {children}
  </button>
);
