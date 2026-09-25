import { HelpRow, type HelpRowCommand } from "./row";

export interface HelpPanelProps {
  category: string;
  commands: HelpRowCommand[];
  active: boolean;
  aliasesLabel: (aliases: string) => string;
}

export const HelpPanel = ({
  category,
  commands,
  active,
  aliasesLabel,
}: HelpPanelProps): JSX.Element => (
  <div
    class={active ? "help-panel active" : "help-panel"}
    data-help-panel={category}
  >
    <div class="help-panel-card">
      {commands.map((command) => (
        <HelpRow key={command.trigger} command={command} aliasesLabel={aliasesLabel} />
      ))}
    </div>
  </div>
);
