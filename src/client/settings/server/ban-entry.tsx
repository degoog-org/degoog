import { Button } from "../../../shared/ui/components/primitives/button";

export interface BanEntryProps {
  ip: string;
  meta: string;
  unbanLabel: string;
  onUnban: () => void;
}

export const BanEntry = ({ ip, meta, unbanLabel, onUnban }: BanEntryProps): JSX.Element => (
  <div class="settings-ban-entry">
    <span class="settings-ban-ip">{ip}</span>
    <span class="settings-row-desc settings-ban-meta">{meta}</span>
    <Button variant="secondary" class="degoog-btn--sm" onClick={onUnban}>
      {unbanLabel}
    </Button>
  </div>
);
