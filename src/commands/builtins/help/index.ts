import type { BangCommand, CommandResult } from "../../../types";
import { getFilteredCommandRegistry } from "../../registry";

export const helpCommand: BangCommand = {
  name: "Help",
  description: "List all available bang commands",
  trigger: "help",
  async execute(): Promise<CommandResult> {
    const commands = await getFilteredCommandRegistry();
    const rows = commands
      .map((c) => {
        const aliasStr = c.aliases.length > 0
          ? ` <span class="command-aliases">(${c.aliases.map((a) => `!${a}`).join(", ")})</span>`
          : "";
        return `<tr><td class="command-trigger">!${c.trigger}${aliasStr}</td><td>${c.name}</td><td>${c.description}</td></tr>`;
      })
      .join("");
    return {
      title: "Available Commands",
      html: `<div class="command-result"><table class="command-help-table"><thead><tr><th>Command</th><th>Name</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    };
  },
};

export default helpCommand;
