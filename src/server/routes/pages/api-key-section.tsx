import { Button } from "../../../shared/ui/components/primitives/button";

const ACTIONS = [
  { id: "settings-api-key-reveal", labelKey: "api-key-reveal", icon: "fa-eye" },
  { id: "settings-api-key-copy", labelKey: "api-key-copy", icon: "fa-copy" },
  {
    id: "settings-api-key-regenerate",
    labelKey: "api-key-regenerate",
    icon: "fa-rotate-right",
  },
];

export const ApiKeySection = (): JSX.Element => (
  <>
    <code id="settings-api-key-value" class="settings-toggle-label"></code>
    <div>
      {ACTIONS.map((action) => (
        <Button
          key={action.id}
          variant="secondary"
          id={action.id}
          aria-label={`{{t:settings-page.server.${action.labelKey}}}`}
        >
          <i class={`fa-solid ${action.icon} fa-lg`}></i>
        </Button>
      ))}
    </div>
  </>
);
