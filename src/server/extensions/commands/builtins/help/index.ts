import {
  TranslateFunction,
  type BangCommand,
  type CommandContext,
  type CommandResult,
  type PluginContext,
} from "../../../../types";
import { getCustomEngineTypes } from "../../../engines/registry";
import { getFilteredCommandRegistry } from "../../registry";
import { escapeHtml } from "../../../../utils/text";

let template = "";

export const helpCommand: BangCommand = {
  name: "Help",
  isClientExposed: false,
  get description(): string {
    return this.t!("help.description");
  },
  trigger: "help",
  supportsNojs: true,

  t: TranslateFunction,

  init(ctx: PluginContext): void {
    template = ctx.template;
  },

  async execute(
    _args: string,
    context?: CommandContext,
  ): Promise<CommandResult> {
    const nojs = context?.nojs === true;
    const [commands, engineTypes] = await Promise.all([
      getFilteredCommandRegistry(),
      getCustomEngineTypes(),
    ]);

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
          `<button class="help-tab${i === 0 ? " active" : ""}" data-help-cat="${escapeHtml(cat)}">${escapeHtml(cat)} <span class="help-tab-count">${groups[cat].length}</span></button>`,
      )
      .join("");

    let panels = "";
    for (let i = 0; i < sortedCategories.length; i++) {
      const cat = sortedCategories[i];
      const rows = groups[cat]
        .map((c) => {
          const aliasStr =
            c.aliases.length > 0
              ? `<span class="help-aliases">${c.aliases.map((a) => `!${escapeHtml(a)}`).join(", ")}</span>`
              : "";
          const searchData = `${c.trigger} ${c.name} ${c.description} ${c.aliases.join(" ")}`;
          return `<div class="help-row" data-help-search="${escapeHtml(searchData)}">
            <div class="help-row-main">
              <span class="help-trigger">!${escapeHtml(c.trigger)}</span>
              <span class="help-name">${escapeHtml(c.name)}</span>
            </div>
            <div class="help-row-desc">${escapeHtml(c.description)}</div>
            ${aliasStr ? `<div class="help-row-aliases">${this.t!("help.aliases", { aliases: aliasStr })}</div>` : ""}
          </div>`;
        })
        .join("");
      panels += `<div class="help-panel${nojs || i === 0 ? " active" : ""}" data-help-panel="${escapeHtml(cat)}"><div class="help-panel-card">${rows}</div></div>`;
    }

    const prefixHint =
      engineTypes.length > 0
        ? `<div class="help-hint">${this.t!("help.prefix-hint", { types: engineTypes.map((t) => `<code>${escapeHtml(t)}:query</code>`).join(", ") })}</div>`
        : "";

    if (nojs) {
      return {
        title: this.t!("help.title"),
        html: `<div class="command-result help-container">
        ${prefixHint}
        <div class="help-layout"><div class="help-panels">${panels}</div></div></div>`,
      };
    }

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
        <div class="help-search-wrap degoog-search-bar degoog-search-bar--square-advanced"><i class="fa-solid fa-magnifying-glass search-icon"></i><input type="text" class="search-input" placeholder="${escapeHtml(this.t!("help.search-placeholder"))}" id="help-search-input"></div>
        ${prefixHint}
        <div class="help-layout"><div class="help-tabs">${tabButtons}</div><div class="help-panels">${panels}</div></div></div>`,
    };
  },
};

export default helpCommand;
