import { raw } from "../../../shared/ui/tribute/rawdogit";
import { Badge } from "../../../shared/ui/components/primitives/badge";
import { Button } from "../../../shared/ui/components/primitives/button";
import { ExtCard } from "../../../shared/ui/components/extensions/ext-card";
import { ExtCardDesc } from "../../../shared/ui/components/extensions/ext-card-desc";
import { ExtCardName } from "../../../shared/ui/components/extensions/ext-card-name";
import { ExtToggle } from "../../../shared/ui/components/extensions/ext-toggle";
import {
  extCardBadgeNode,
  extCardRestartWarningNode,
  extCardVersionWarningNode,
} from "../shared/ext-card";
import { extraTypeLabels } from "./engine-types";
import type { ExtensionMeta } from "../../types";
import { renderMdInline } from "../../utils/md";

const t = window.scopedT("core");

export const EngineCard = ({
  engine,
  enabled,
  allowConfigure,
  onToggle,
  onConfigure,
}: {
  engine: ExtensionMeta;
  enabled: boolean;
  allowConfigure: boolean;
  onToggle: (event: Event) => void;
  onConfigure: () => void;
}): JSX.Element => {
  const toggleId = `engine-toggle-${engine.id}`;
  const extraTypes = extraTypeLabels(engine);

  return (
    <ExtCard
      id={engine.id}
      nameRow={[
        extCardRestartWarningNode(engine),
        <ExtCardName
          htmlFor={toggleId}
          class="engine-toggle-label"
          name={engine.displayName}
        />,
        engine.compatibilityLayer ? (
          <Badge modifier="engine-type">{engine.compatibilityLayer}</Badge>
        ) : null,
      ]}
      info={[
        engine.description ? (
          <ExtCardDesc html={raw(renderMdInline(engine.description))} />
        ) : null,
        extraTypes.length ? (
          <div class="ext-card-extra-types">
            <span class="ext-card-extra-types-label">
              {t("settings-page.extensions.extra-types")}
            </span>
            {extraTypes.map((label) => (
              <Badge modifier="engine-type">{label}</Badge>
            ))}
          </div>
        ) : null,
        extCardVersionWarningNode(engine),
      ]}
      actions={[
        allowConfigure ? extCardBadgeNode(engine) : null,
        allowConfigure && engine.configurable ? (
          <Button
            variant="secondary"
            class="ext-card-configure"
            data-id={engine.id}
            onClick={onConfigure}
          >
            {t("settings-page.extensions.configure")}
          </Button>
        ) : null,
        <ExtToggle
          id={toggleId}
          inputClass="engine-toggle-input"
          dataId={engine.id}
          checked={enabled}
          onChange={onToggle}
        />,
      ]}
    />
  );
};
