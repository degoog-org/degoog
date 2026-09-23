import { Badge } from "../../../shared/ui/components/primitives/badge";
import { Button } from "../../../shared/ui/components/primitives/button";
import { Icon } from "../../../shared/ui/components/primitives/icon";
import type { CompatLayerView } from "./compat-api";

const t = window.scopedT("core");

const COMPAT_NOTES = [
  "compat-note-native",
  "compat-note-upstream",
  "compat-note-updates",
  "compat-note-needs",
];

const _layerBtnId = (layer: CompatLayerView): string => `open-compat-${layer.id}`;

export const CompatSection = ({
  layers,
  onOpen,
}: {
  layers: CompatLayerView[];
  onOpen: (layer: CompatLayerView) => void;
}): JSX.Element => (
  <section class="settings-section ext-card degoog-panel degoog-panel--ext-card">
    <div class="setting-section-heading-wrapper">
      <h2 class="settings-section-heading">
        {t("settings-page.extensions.compat-heading")}
        <Badge modifier="experimental">{t("settings-page.extensions.compat-experimental")}</Badge>
      </h2>
      <div class="floating-section-icon">
        <Icon name="fa-solid fa-flask" />
      </div>
    </div>
    <p class="settings-desc">{t("settings-page.extensions.compat-desc")}</p>
    <div class="compat-note">
      <ul class="compat-note-list">
        {COMPAT_NOTES.map((key) => (
          <li>{t(`settings-page.extensions.${key}`)}</li>
        ))}
      </ul>
    </div>
    <div class="settings-page-actions">
      {layers.map((layer) => (
        <Button variant="secondary" id={_layerBtnId(layer)} onClick={() => onOpen(layer)}>
          {t("settings-page.extensions.compat-open", { layer: layer.label })}
        </Button>
      ))}
    </div>
  </section>
);
