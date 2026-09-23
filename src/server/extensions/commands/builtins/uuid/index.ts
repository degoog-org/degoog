import { renderUuidList } from "./render";
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
    return {
      title: this.t!("uuid.title"),
      html: renderUuidList(uuids, context?.nojs ? undefined : this.t!("uuid.copy")),
    };
  },
};

export default uuidCommand;
