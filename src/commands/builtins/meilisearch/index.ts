import type { BangCommand, CommandContext, CommandResult, SettingField } from "../../../types";
import { getSettings, asString } from "../../../plugin-settings";

export const MEILISEARCH_ID = "meilisearch";

export const meilisearchSettingsSchema: SettingField[] = [
  {
    key: "url",
    label: "Meilisearch URL",
    type: "url",
    required: true,
    placeholder: "http://localhost:7700",
    description: "Base URL of your Meilisearch instance",
  },
  {
    key: "apiKey",
    label: "API Key",
    type: "password",
    secret: true,
    placeholder: "Leave blank if no key is set",
    description: "Optional master or search API key",
  },
  {
    key: "indexes",
    label: "Indexes",
    type: "text",
    required: true,
    placeholder: "my_index,another_index",
    description: "Comma-separated list of indexes to search",
  },
  {
    key: "titleField",
    label: "Title Field",
    type: "text",
    placeholder: "title",
    description: "Document field to use as the result title",
  },
  {
    key: "urlField",
    label: "URL Field",
    type: "text",
    placeholder: "url",
    description: "Document field to use as the result link",
  },
  {
    key: "contentField",
    label: "Content Field",
    type: "text",
    placeholder: "content",
    description: "Document field to use as the result snippet",
  },
  {
    key: "thumbnailField",
    label: "Thumbnail Field",
    type: "text",
    placeholder: "thumbnail",
    description: "Document field for the result thumbnail image (optional)",
  },
];

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const PER_PAGE = 20;
const MEILISEARCH_LOGO =
  "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@refs/heads/main/svg/meilisearch.svg";

async function searchIndex(
  meiliUrl: string,
  apiKey: string,
  index: string,
  query: string,
  offset: number,
): Promise<{ index: string; hits: Record<string, unknown>[]; estimatedTotalHits: number }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(`${meiliUrl}/indexes/${index}/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ q: query, limit: PER_PAGE, offset }),
  });
  const data = await res.json() as { hits?: Record<string, unknown>[]; estimatedTotalHits?: number };
  return { index, hits: data.hits || [], estimatedTotalHits: data.estimatedTotalHits ?? (data.hits?.length || 0) };
}

export const meilisearchCommand: BangCommand = {
  name: "Meilisearch",
  description: "Search across your Meilisearch indexes",
  trigger: "meili",
  aliases: ["ms"],
  settingsSchema: meilisearchSettingsSchema,

  configure(_settings: Record<string, string>): void {},

  async isConfigured(): Promise<boolean> {
    const stored = await getSettings(MEILISEARCH_ID);
    return !!(stored["url"] && stored["indexes"]);
  },

  async execute(args: string, context?: CommandContext): Promise<CommandResult> {
    const stored = await getSettings(MEILISEARCH_ID);
    const meiliUrl = asString(stored["url"]);
    const apiKey = asString(stored["apiKey"]);
    const indexes = asString(stored["indexes"]).split(",").map((s: string) => s.trim()).filter(Boolean);
    const titleField = asString(stored["titleField"]) || "title";
    const urlField = asString(stored["urlField"]) || "url";
    const contentField = asString(stored["contentField"]) || "content";
    const thumbnailField = asString(stored["thumbnailField"]) || "thumbnail";

    if (!meiliUrl || indexes.length === 0) {
      return {
        title: "Meilisearch",
        html: `<div class="command-result"><p>Meilisearch is not configured. Go to <a href="/settings">Settings → Plugins</a> to set up your Meilisearch URL and indexes.</p></div>`,
      };
    }

    if (!args.trim()) {
      return {
        title: "Meilisearch",
        html: `<div class="command-result"><p>Usage: <code>!meili &lt;search term&gt;</code></p><p>Indexes: ${indexes.map((i) => `<code>${escHtml(i)}</code>`).join(", ")}</p></div>`,
      };
    }

    try {
      const term = args.trim();
      const page = context?.page ?? 1;
      const offset = (page - 1) * PER_PAGE;

      const settled = await Promise.allSettled(
        indexes.map((idx) => searchIndex(meiliUrl, apiKey, idx, term, offset)),
      );

      const allHits: { hit: Record<string, unknown>; index: string }[] = [];
      let totalEstimated = 0;
      for (const result of settled) {
        if (result.status === "fulfilled") {
          totalEstimated += result.value.estimatedTotalHits;
          for (const hit of result.value.hits) {
            allHits.push({ hit, index: result.value.index });
          }
        }
      }

      if (allHits.length === 0) {
        return {
          title: "Meilisearch",
          html: `<div class="command-result"><p>No results found for "${escHtml(term)}"</p></div>`,
        };
      }

      const results = allHits
        .map(({ hit, index }) => {
          const title = String(hit[titleField] || "");
          const url = String(hit[urlField] || "");
          const content = String(hit[contentField] || hit["metadata_summary"] || "");
          const thumbnail = String(hit[thumbnailField] || "");
          const source = String(hit["source"] || "");
          const type = String(hit["type"] || "");

          if (!title || !url) return "";

          const favicon = `<img class="result-favicon" src="${MEILISEARCH_LOGO}" alt="">`;
          const thumbBlock = thumbnail
            ? `<div class="result-thumbnail-wrap"><img class="result-thumbnail-img" src="${escHtml(thumbnail)}" alt=""></div>`
            : "";

          const indexLabel = index.replace(/_content$/, "");
          const tags = [
            `<span class="result-engine-tag">${escHtml(indexLabel)}</span>`,
            type ? `<span class="result-engine-tag">${escHtml(type)}</span>` : "",
            source ? `<span class="result-engine-tag">${escHtml(source)}</span>` : "",
          ].filter(Boolean).join("");

          return `<div class="result-item"><div class="result-item-inner"><div class="result-body"><div class="result-url-row">${favicon}<cite class="result-cite">${escHtml(url)}</cite></div><a class="result-title" href="${escHtml(url)}" target="_blank">${escHtml(title)}</a><p class="result-snippet">${escHtml(content)}</p><div class="result-engines">${tags}</div></div>${thumbBlock}</div></div>`;
        })
        .filter(Boolean)
        .join("");

      const totalPages = Math.ceil(totalEstimated / PER_PAGE);
      const pageInfo = totalPages > 1 ? ` — Page ${page} of ${totalPages}` : "";
      return {
        title: `Meilisearch: ${term} — ${totalEstimated} results${pageInfo}`,
        html: `<div class="command-result">${results}</div>`,
        totalPages,
      };
    } catch {
      return {
        title: "Meilisearch",
        html: `<div class="command-result"><p>Failed to connect to Meilisearch. Check your configuration.</p></div>`,
      };
    }
  },
};

export default meilisearchCommand;
