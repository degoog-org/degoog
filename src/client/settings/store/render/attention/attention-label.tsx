import { FaIcon } from "../fa-icon";

export const AttentionLabel = ({
  icon,
  danger = false,
  text,
}: {
  icon: string;
  danger?: boolean;
  text: string;
}): JSX.Element => (
  <span class="settings-row-label store-att-label">
    <FaIcon
      name={icon}
      class={danger ? "store-att-icon store-att-icon--danger" : "store-att-icon"}
    />
    {text}
  </span>
);
