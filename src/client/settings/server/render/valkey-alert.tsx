import { ServerSection } from "./server-section";

export const VALKEY_ALERT_ID = "settings-server-valkey-alert";

export const ValkeyAlert = (): JSX.Element => (
  <div id={VALKEY_ALERT_ID} role="alert" hidden={true}>
    <ServerSection
      class="settings-server-alert"
      collapsible={false}
      heading="settings-page.server.valkey-unreachable-title"
      icon="fa-solid fa-triangle-exclamation"
      desc="settings-page.server.valkey-unreachable-body"
    />
  </div>
);
