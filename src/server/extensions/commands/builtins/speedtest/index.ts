import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  TranslateFunction,
  type BangCommand,
  type CommandResult,
} from "../../../../types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const speedtestHtml = readFileSync(join(__dirname, "script.html"), "utf-8");

export const speedtestCommand: BangCommand = {
  name: "Speed Test",
  get description(): string {
    return this.t!("speedtest.description");
  },
  trigger: "speedtest",
  naturalLanguagePhrases: [
    "speed test",
    "run a speed test",
    "test my internet speed",
  ],

  t: TranslateFunction,

  async execute(): Promise<CommandResult> {
    return {
      title: this.t!("speedtest.title"),
      html: speedtestHtml,
    };
  },
};

export default speedtestCommand;
