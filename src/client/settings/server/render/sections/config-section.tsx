import { BackupBlock } from "../backup-block";
import { PresetsBlock } from "../presets-block";
import { ServerSection } from "../server-section";

export const ConfigSection = (): JSX.Element => (
  <ServerSection
    id="settings-section-server-presets"
    heading="settings-page.server.config.heading"
    icon="fa-solid fa-sliders"
    desc="settings-page.server.config.desc"
  >
    <PresetsBlock />
    <BackupBlock />
  </ServerSection>
);
