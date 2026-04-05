import {
  TranslateFunction,
  type BangCommand,
  type CommandResult,
} from "../../../../types";

const DEFAULT_UUID_COUNT = 10;
const MAX_UUID_COUNT = 100;

export const uuidCommand: BangCommand = {
  name: "UUID Generator",
  get description(): string {
    return this.t!("uuid.description");
  },
  trigger: "uuid",
  naturalLanguagePhrases: ["uuid", "generate uuid", "generate uuids"],

  t: TranslateFunction,

  async execute(args: string): Promise<CommandResult> {
    const raw = args.trim();
    const count = raw
      ? Math.min(
          MAX_UUID_COUNT,
          Math.max(1, Math.floor(Number(raw)) || DEFAULT_UUID_COUNT),
        )
      : DEFAULT_UUID_COUNT;
    const uuids = Array.from({ length: count }, () => crypto.randomUUID());
    const copyLabel = this.t!("uuid.copy");
    const rows = uuids
      .map(
        (u) =>
          `<div class="uuid-row"><code class="uuid-value">${u}</code><button type="button" class="uuid-copy" data-uuid="${u}">${copyLabel}</button></div>`,
      )
      .join("");
    return {
      title: this.t!("uuid.title"),
      html: `<div class="command-result command-uuid">${rows}</div>`,
    };
  },
};

export default uuidCommand;
