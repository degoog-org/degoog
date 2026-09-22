import type { Child } from "../../tribute/types";

export const EXT_CARD_CLASS = "ext-card degoog-panel degoog-panel--ext-card";

export interface ExtCardProps {
  id?: string;
  themeId?: string;
  nameRow?: Child;
  info?: Child;
  actions?: Child;
  children?: Child;
}

export const ExtCard = ({
  id,
  themeId,
  nameRow,
  info,
  actions,
  children,
}: ExtCardProps): JSX.Element => (
  <div class={EXT_CARD_CLASS} data-id={id} data-theme-id={themeId}>
    <div class="ext-card-main">
      <div class="ext-card-info">
        {nameRow === undefined ? null : (
          <div class="ext-card-name-row">{nameRow}</div>
        )}
        {info}
      </div>
      <div class="ext-card-actions">{actions}</div>
    </div>
    {children}
  </div>
);
