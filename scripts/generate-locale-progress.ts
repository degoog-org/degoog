import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type LocaleValue = string | { [key: string]: LocaleValue };

const LOCALES_DIR = join(import.meta.dir, "../src/locales");
const OUTPUT_PATH = join(import.meta.dir, "../screenshots/locales-progress.svg");
const escapeXml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&apos;",
})[character] ?? character);

// Flatten nested locale files so matching keys can be compared.
const flatten = (value: LocaleValue, prefix = ""): Map<string, string> => {
	const entries = new Map<string, string>();
	for (const [key, child] of Object.entries(value)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (typeof child === "string") entries.set(path, child);
		else for (const [childPath, text] of flatten(child, path)) entries.set(childPath, text);
	}
	return entries;
};

const files = (await readdir(LOCALES_DIR)).filter((file) => file.endsWith(".json") && file !== "en-US.json").sort();
const reference = flatten(JSON.parse(await readFile(join(LOCALES_DIR, "en-US.json"), "utf8")) as LocaleValue);
const displayNames = new Intl.DisplayNames(["en"], { type: "language" });
const rows = await Promise.all(files.map(async (file) => {
	const locale = file.slice(0, -5);
	const translations = flatten(JSON.parse(await readFile(join(LOCALES_DIR, file), "utf8")) as LocaleValue);
	// Count non-empty strings that differ from the English source.
	const translated = [...reference.keys()].filter((key) => {
		const value = translations.get(key);
		return Boolean(value?.trim()) && value !== reference.get(key);
	}).length;
	return { locale, name: displayNames.of(locale) ?? locale, translated, total: reference.size, percent: Math.round((translated / reference.size) * 100) };
}));

const width = 1120;
const rowHeight = 58;
const height = 206 + rows.length * rowHeight + 42;
const barX = 610;
const barWidth = 380;
const rowMarkup = rows.map((row, index) => {
	const y = 174 + index * rowHeight;
	const fillWidth = barWidth * row.percent / 100;
	return `
  <g>
    <text x="82" y="${y}" class="name">${escapeXml(row.name)}</text>
    <text x="82" y="${y + 22}" class="code">${escapeXml(row.locale)}</text>
    <rect x="${barX}" y="${y - 15}" width="${barWidth}" height="12" rx="6" class="track" />
    <rect x="${barX}" y="${y - 15}" width="${fillWidth}" height="12" rx="6" class="fill" />
    <text x="1040" y="${y - 4}" class="percent" text-anchor="end">${row.percent}%</text>
  </g>`;
}).join("");

// Keep the graphic self-contained so release builds need no image packages.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Degoog locale translation progress</title>
  <desc id="description">Translation coverage across ${rows.length} locales, measured against the English source.</desc>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .panel { fill: #161b22; }
    .title { fill: #f0f6fc; font-size: 25px; font-weight: 600; }
    .subtitle { fill: #8b949e; font-size: 14px; }
    .name { fill: #e6edf3; font-size: 15px; font-weight: 500; }
    .code { fill: #8b949e; font-size: 12px; }
    .percent { fill: #c9d1d9; font-size: 14px; font-variant-numeric: tabular-nums; }
    .track { fill: #30363d; }
    .fill { fill: #2da44e; }
    .rule { stroke: #30363d; }
  </style>
  <rect x="32" y="28" width="${width - 64}" height="${height - 56}" rx="12" class="panel" />
  <text x="70" y="82" class="title">Locale translation progress</text>
  <text x="70" y="109" class="subtitle">Coverage against the English source · ${rows.length} locales</text>
  <line x1="70" y1="137" x2="${width - 70}" y2="137" class="rule" />
  ${rowMarkup}
</svg>
`;

await writeFile(OUTPUT_PATH, svg);
