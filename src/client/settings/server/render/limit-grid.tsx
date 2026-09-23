import { NumberInline } from "./number-inline";
import { ServerLabel } from "./server-label";

export interface LimitField {
  id: string;
  k: string;
  min: number;
  max: number;
  placeholder: string;
}

export const LimitGrid = ({ fields }: { fields: readonly LimitField[] }): JSX.Element => (
  <div class="settings-rl-grid">
    {fields.map((field) => (
      <>
        <ServerLabel htmlFor={field.id} k={field.k} />
        <NumberInline id={field.id} min={field.min} max={field.max} placeholder={field.placeholder} />
      </>
    ))}
  </div>
);
