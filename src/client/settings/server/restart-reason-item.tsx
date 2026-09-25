import { formatReason } from "../shared/restart-state";

export const RestartReasonItem = ({ reason }: { reason: string }): JSX.Element => (
  <li>{`• ${formatReason(reason)}`}</li>
);
