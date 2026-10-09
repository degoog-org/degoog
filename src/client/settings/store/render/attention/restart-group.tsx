import { Button } from "../../../../../shared/ui/components/primitives/button";
import { AttentionLabel } from "./attention-label";
import { AttentionRow } from "./attention-row";
import { BusyLabel } from "../busy-label";
import { counted, listNames } from "../../format";
import type { StoreActions } from "../../../../types/store-tab";

const t = window.scopedT("core");

export const RestartGroup = ({
  names,
  restarting,
  actions,
}: {
  names: string[];
  restarting: boolean;
  actions: StoreActions;
}): JSX.Element => (
  <div class="settings-group">
    <AttentionRow
      label={<AttentionLabel icon="fa-rotate" text={t("settings-page.restart.heading")} />}
      desc={counted("restart-desc", names.length, { names: listNames(names) })}
      control={
        <Button variant="secondary" disabled={restarting} onClick={actions.restart}>
          {restarting ? (
            <BusyLabel label={t("settings-page.restart.restarting")} />
          ) : (
            t("settings-page.restart.button")
          )}
        </Button>
      }
    />
  </div>
);
