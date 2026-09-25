export interface IconProps {
  name: string;
  label?: string | null;
}

export const Icon = ({ name, label }: IconProps): JSX.Element =>
  label ? <i class={name} aria-label={label}></i> : <i class={name}></i>;
