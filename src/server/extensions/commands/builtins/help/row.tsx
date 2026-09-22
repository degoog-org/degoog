import { RawDogIt } from "../../../../../shared/ui/tribute/rawdogit";
import { renderHtml } from "../../../../../shared/ui/tribute/html";

export interface HelpRowCommand {
  trigger: string;
  name: string;
  description: string;
  aliases: string[];
}

export interface HelpRowProps {
  command: HelpRowCommand;
  aliasesLabel: (aliases: string) => string;
}

export const HelpRow = ({
  command,
  aliasesLabel,
}: HelpRowProps): JSX.Element => {
  const aliasStr = command.aliases.length
    ? renderHtml(
        <span class="help-aliases">
          {command.aliases.map((a) => `!${a}`).join(", ")}
        </span>,
      )
    : "";
  const searchData = `${command.trigger} ${command.name} ${command.description} ${command.aliases.join(" ")}`;
  return (
    <div class="help-row" data-help-search={searchData}>
      <div class="help-row-main">
        <span class="help-trigger">{`!${command.trigger}`}</span>
        <span class="help-name">{command.name}</span>
      </div>
      <div class="help-row-desc">{command.description}</div>
      {aliasStr ? (
        <div class="help-row-aliases">
          <RawDogIt html={aliasesLabel(aliasStr)} />
        </div>
      ) : null}
    </div>
  );
};
