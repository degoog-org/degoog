import { getConfigStatus } from "../../utils/dom";
import { Badge } from "../../../shared/ui/components/primitives/badge";
import { Button } from "../../../shared/ui/components/primitives/button";
import { Icon } from "../../../shared/ui/components/primitives/icon";
import type { EventHandler, VNode } from "../../../shared/ui/tribute/types";
import type { ExtensionMeta } from "../../types/extension";

const t = window.scopedT("core");

export const extCardBadgeNode = (ext: ExtensionMeta): VNode | null => {
  const status = ext.configurable ? getConfigStatus(ext) : null;
  if (status === "configured") {
    return (
      <span
        class="ext-configured-badge"
        data-tooltip={t("settings-page.extensions.status-configured")}
      ></span>
    );
  }
  if (status === "needs-config") {
    return (
      <span
        class="ext-needs-config-badge"
        data-tooltip={t("settings-page.extensions.status-needs-config")}
      ></span>
    );
  }
  return null;
};

export const extCardConfigureNode = (
  ext: ExtensionMeta,
  onClick?: EventHandler,
): VNode | null =>
  ext.configurable ? (
    <Button
      variant="secondary"
      class="ext-card-configure"
      data-id={ext.id}
      onClick={onClick}
    >
      {t("settings-page.extensions.configure")}
    </Button>
  ) : null;

export const extCardVersionWarningNode = (ext: ExtensionMeta): VNode | null =>
  ext.requiresNewerVersion ? (
    <span class="ext-version-warning">
      {t("settings-page.extensions.requires-newer-version")}
    </span>
  ) : null;

export const extCardRestartWarningNode = (ext: ExtensionMeta): VNode | null =>
  ext.needsAppRestart ? (
    <Badge
      modifier="restart-required"
      tooltip={t("settings-page.extensions.restart-required")}
    >
      <Icon name="fa-solid fa-triangle-exclamation" />
    </Badge>
  ) : null;
