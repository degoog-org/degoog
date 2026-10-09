import { Button } from "../../../../shared/ui/components/primitives/button";
import type { ExtFilter } from "../../../types/ext-filter";

const t = window.scopedT("core");

export const ExtNoMatch = ({
  filter,
  onClear,
}: {
  filter: ExtFilter;
  onClear: () => void;
}): JSX.Element => {
  const q = filter.q.trim();
  return (
    <div class="ext-no-match">
      <p>
        {q
          ? t("settings-page.ext-filter.no-match-query", { q })
          : t("settings-page.ext-filter.no-match-filters")}
      </p>
      <Button variant="secondary" class="degoog-btn--sm" onClick={onClear}>
        {t("settings-page.ext-filter.clear-filters")}
      </Button>
    </div>
  );
};
