export interface ExtCardNameProps {
  htmlFor: string;
  class?: string;
  name: string;
}

export const ExtCardName = ({ htmlFor, class: extra, name }: ExtCardNameProps): JSX.Element => (
  <label for={htmlFor} class={extra ? `ext-card-name ${extra}` : "ext-card-name"}>
    {name}
  </label>
);
