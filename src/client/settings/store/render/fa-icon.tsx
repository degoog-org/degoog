export const FaIcon = ({
  name,
  class: extra,
}: {
  name: string;
  class?: string;
}): JSX.Element => (
  <i
    class={extra ? `fa-solid ${name} ${extra}` : `fa-solid ${name}`}
    aria-hidden="true"
  ></i>
);
