import { Badge } from "../../../shared/ui/components/primitives/badge";
import { Icon } from "../../../shared/ui/components/primitives/icon";
import type { ExtensionMeta } from "../../types";

const t = window.scopedT("core");

const EXPOSURE = {
  exposed: {
    modifier: "proxy-exposed",
    key: "exposure-exposed",
    icon: "fa-solid fa-triangle-exclamation",
  },
  safe: {
    modifier: "proxy-safe",
    key: "exposure-safe",
    icon: "fa-solid fa-circle-check",
  },
  unknown: {
    modifier: "proxy-unknown",
    key: "exposure-unknown",
    icon: "fa-solid fa-circle-info",
  },
} as const;

export const ExposureBadge = ({ plugin }: { plugin: ExtensionMeta }): JSX.Element => {
  const state =
    plugin.isClientExposed === true
      ? EXPOSURE.exposed
      : plugin.isClientExposed === false
        ? EXPOSURE.safe
        : EXPOSURE.unknown;
  return (
    <Badge modifier={state.modifier} tooltip={t(`settings-page.extensions.${state.key}`)}>
      <Icon name={state.icon} />
    </Badge>
  );
};
