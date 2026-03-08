import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { BangCommand, CommandResult } from "../../../types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const speedtestHtml = readFileSync(join(__dirname, "script.html"), "utf-8");

export const speedtestCommand: BangCommand = {
  name: "Speed Test",
  description: "Run an internet speed test",
  trigger: "speedtest",
  async execute(): Promise<CommandResult> {
    return {
      title: "Speed Test",
      html: speedtestHtml,
    };
  },
};

export default speedtestCommand;
