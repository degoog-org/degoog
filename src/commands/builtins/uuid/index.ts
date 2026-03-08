import type { BangCommand, CommandResult } from "../../../types";

const DEFAULT_UUID_COUNT = 10;
const MAX_UUID_COUNT = 100;

export const uuidCommand: BangCommand = {
  name: "UUID Generator",
  description: "Generate random UUIDs v4 (default 10, or specify a number)",
  trigger: "uuid",
  naturalLanguagePhrases: ["uuid", "generate uuid", "generate uuids"],
  async execute(args: string): Promise<CommandResult> {
    const raw = args.trim();
    const count = raw ? Math.min(MAX_UUID_COUNT, Math.max(1, Math.floor(Number(raw)) || DEFAULT_UUID_COUNT)) : DEFAULT_UUID_COUNT;
    const uuids = Array.from({ length: count }, () => crypto.randomUUID());
    const rows = uuids
      .map((u) => `<div class="uuid-row"><code class="uuid-value">${u}</code><button type="button" class="uuid-copy" data-uuid="${u}">Copy</button></div>`)
      .join("");
    return {
      title: "Generated UUIDs",
      html: `<div class="command-result command-uuid">${rows}</div>`,
    };
  },
};

export default uuidCommand;
