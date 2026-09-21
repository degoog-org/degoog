import {
  TranslateFunction,
  type BangCommand,
  type CommandContext,
  type CommandResult,
} from "../../../../types";

const DEFAULT_UUID_COUNT = 10;
const MAX_UUID_COUNT = 100;

export const uuidCommand: BangCommand = {
  name: "UUID Generator",
  isClientExposed: false,
  get description(): string {
    return this.t!("uuid.description");
  },
  trigger: "uuid",
  naturalLanguagePhrases: ["uuid", "generate uuid", "generate uuids"],
  supportsNojs: true,

  t: TranslateFunction,

  async execute(
    args: string,
    context?: CommandContext,
  ): Promise<CommandResult> {
    const raw = args.trim();
    const count = raw
      ? Math.min(
        MAX_UUID_COUNT,
        Math.max(1, Math.floor(Number(raw)) || DEFAULT_UUID_COUNT),
      )
      : DEFAULT_UUID_COUNT;
    const uuids = Array.from({ length: count }, () => crypto.randomUUID());
    const copyLabel = this.t!("uuid.copy");
    const copyButton = (u: string): string =>
      context?.nojs
        ? ""
        : `<button type="button" class="uuid-copy" data-uuid="${u}">${copyLabel}</button>`;
    const rows = uuids
      .map(
        (u) =>
          `<div class="uuid-row"><code class="uuid-value">${u}</code>${copyButton(u)}</div>`,
      )
      .join("");
    return {
      title: this.t!("uuid.title"),
      html: `<div class="command-result command-uuid">${rows}</div>`,
    };
  },
};

export default uuidCommand;
