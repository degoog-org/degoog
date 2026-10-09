import { FaIcon } from "./fa-icon";

export const BusyLabel = ({ label }: { label: string }): JSX.Element => (
  <>
    <FaIcon name="fa-circle-notch" class="fa-spin" />
    {label}
  </>
);
