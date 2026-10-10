import { FaIcon } from "./fa-icon";

export const VersionChange = ({
  from,
  to,
  class: cls = "store-ver",
}: {
  from: string;
  to: string;
  class?: string;
}): JSX.Element => (
  <span class={cls}>
    <span>{`v${from}`}</span>
    <FaIcon name="fa-arrow-right" />
    <b>{`v${to}`}</b>
  </span>
);
