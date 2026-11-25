import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { renderHtml } from "../src/shared/ui/tribute/html";
import {
  LocaleProgressCard,
  type LocaleProgress,
} from "./locale-progress-card";

type LocaleTree = { [key: string]: unknown };

const LOCALES_DIR = join(import.meta.dir, "../src/locales");
const SOURCE_FILE = "en-US.json";
const DEFAULT_OUTPUT_PATH = join(import.meta.dir, "../dist/locales-progress.svg");

const _flatten = (tree: LocaleTree, prefix = ""): Map<string, string> => {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      entries.set(path, value);
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    for (const [childPath, text] of _flatten(value as LocaleTree, path)) {
      entries.set(childPath, text);
    }
  }
  return entries;
};

const _readLocale = async (file: string): Promise<Map<string, string>> =>
  _flatten(JSON.parse(await readFile(join(LOCALES_DIR, file), "utf8")));

const _countTranslated = (
  source: Map<string, string>,
  translations: Map<string, string>,
): number =>
  [...source.keys()].filter((key) => Boolean(translations.get(key)?.trim()))
    .length;

const outputPath = resolve(process.argv[2] ?? DEFAULT_OUTPUT_PATH);
const source = await _readLocale(SOURCE_FILE);
const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
const files = (await readdir(LOCALES_DIR))
  .filter((file) => file.endsWith(".json") && file !== SOURCE_FILE)
  .sort();

const rows: LocaleProgress[] = await Promise.all(
  files.map(async (file) => {
    const locale = file.slice(0, -".json".length);
    const translated = _countTranslated(source, await _readLocale(file));
    return {
      locale,
      name: displayNames.of(locale) ?? locale,
      percent: Math.floor((translated / source.size) * 100),
    };
  }),
);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${renderHtml(LocaleProgressCard({ rows, total: source.size }))}\n`,
);
console.log(`Locale progress written to ${outputPath}`);
