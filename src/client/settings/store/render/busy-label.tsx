import { Spinner } from "./spinner";

export const BusyLabel = ({ label }: { label: string }): JSX.Element => (
  <>
    <Spinner />
    {label}
  </>
);
