import {
  TranslateFunction,
  type BangCommand,
  type CommandContext,
  type CommandResult,
  type PluginContext,
} from "../../../../types";
import { getCustomEngineTypes } from "../../../engines/registry";
import { getFilteredCommandRegistry } from "../../registry";
import {
  renderEngineTypeCode,
  renderHelpContainer,
  renderPanels,
  renderPrefixHint,
  renderTabButtons,
} from "./render";

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

    const aliasesLabel = (aliases: string): string =>
      this.t!("help.aliases", { aliases });

    const prefixHint =
      engineTypes.length > 0
        ? this.t!("help.prefix-hint", {
            types: engineTypes.map(renderEngineTypeCode).join(", "),
          })
        : "";

    if (!nojs && template) {
      const html = template
        .replace("{{tabButtons}}", renderTabButtons(sortedCategories, groups))
        .replace(
          "{{panels}}",
          renderPanels(sortedCategories, groups, nojs, aliasesLabel),
        )
        .replace("{{prefixHint}}", renderPrefixHint(prefixHint));
      return { title: this.t!("help.title"), html };
    }

    return {
      title: this.t!("help.title"),
      html: renderHelpContainer({
        nojs,
        searchPlaceholder: nojs ? "" : this.t!("help.search-placeholder"),
        prefixHint,
        categories: sortedCategories,
        groups,
        aliasesLabel,
      }),
    };
  },
};

export default helpCommand;
