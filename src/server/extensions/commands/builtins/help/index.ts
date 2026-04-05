import {
  TranslateFunction,
  type BangCommand,
  type CommandResult,
  type PluginContext,
} from "../../../../types";
import { getCustomEngineTypes } from "../../../engines/registry";
import { getFilteredCommandRegistry } from "../../registry";

let template = "";

function _escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const helpCommand: BangCommand = {
  name: "Help",
  get description(): string {
    return this.t!("help.description");
  },
  trigger: "help",

  t: TranslateFunction,

  init(ctx: PluginContext): void {
    template = ctx.template;
  },

  async execute(): Promise<CommandResult> {
    const commands = await getFilteredCommandRegistry();
    const engineTypes = getCustomEngineTypes();

    const groups: Record<string, typeof commands> = {};
    for (const c of commands) {
      const cat = c.category || this.t!("help.category-other");
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    }

    const categoryOrder = ["Built-in", "Plugins", "Engine shortcuts"];
    const sortedCategories = Object.keys(groups).sort((a, b) => {
      const ai = categoryOrder.indexOf(a);
      const bi = categoryOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const tabButtons = sortedCategories
      .map(
        (cat, i) =>
          `<button class="help-tab${i === 0 ? " active" : ""}" data-help-cat="${_escapeHtml(cat)}">${_escapeHtml(cat)} <span class="help-tab-count">${groups[cat].length}</span></button>`,
      )
      .join("");

    let panels = "";
    for (let i = 0; i < sortedCategories.length; i++) {
      const cat = sortedCategories[i];
      const rows = groups[cat]
        .map((c) => {
          const aliasStr =
            c.aliases.length > 0
              ? `<span class="help-aliases">${c.aliases.map((a) => `!${_escapeHtml(a)}`).join(", ")}</span>`
              : "";
          const searchData = `${c.trigger} ${c.name} ${c.description} ${c.aliases.join(" ")}`;
          return `<div class="help-row" data-help-search="${_escapeHtml(searchData)}">
            <div class="help-row-main">
              <span class="help-trigger">!${_escapeHtml(c.trigger)}</span>
              <span class="help-name">${_escapeHtml(c.name)}</span>
            </div>
            <div class="help-row-desc">${_escapeHtml(c.description)}</div>
            ${aliasStr ? `<div class="help-row-aliases">${this.t!("help.aliases", { aliases: aliasStr })}</div>` : ""}
          </div>`;
        })
        .join("");
      panels += `<div class="help-panel${i === 0 ? " active" : ""}" data-help-panel="${_escapeHtml(cat)}">${rows}</div>`;
    }

    const prefixHint =
      engineTypes.length > 0
        ? `<div class="help-hint">${this.t!("help.prefix-hint", { types: engineTypes.map((t) => `<code>${_escapeHtml(t)}:query</code>`).join(", ") })}</div>`
        : "";

    if (template) {
      const html = template
        .replace("{{tabButtons}}", tabButtons)
        .replace("{{panels}}", panels)
        .replace("{{prefixHint}}", prefixHint);
      return { title: this.t!("help.title"), html };
    }

    return {
      title: this.t!("help.title"),
      html: `<div class="command-result help-container">
        <div class="help-search-wrap"><input type="text" class="help-search" placeholder="${_escapeHtml(this.t!("help.search-placeholder"))}" id="help-search-input"></div>
        ${prefixHint}
        <div class="help-layout"><div class="help-tabs">${tabButtons}</div><div class="help-panels">${panels}</div></div>
      </div>`,
    };
  },
};

export default helpCommand;
