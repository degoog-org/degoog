import type { BangCommand, CommandContext, CommandResult, SettingField } from "../../../types";
import { getSettings, asString } from "../../../plugin-settings";

export const JELLYFIN_ID = "jellyfin";

export const jellyfinSettingsSchema: SettingField[] = [
  {
    key: "url",
    label: "Jellyfin URL",
    type: "url",
    required: true,
    placeholder: "https://your-jellyfin-server.com",
    description: "Base URL of your Jellyfin server",
  },
  {
    key: "apiKey",
    label: "API Key",
    type: "password",
    secret: true,
    required: true,
    placeholder: "Enter your Jellyfin API key",
    description: "Found in Jellyfin Dashboard → API Keys",
  },
];

const JELLYFIN_LOGO =
  "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@refs/heads/main/svg/jellyfin.svg";

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const jellyfinCommand: BangCommand = {
  name: "Jellyfin",
  description: "Search your Jellyfin media library",
  trigger: "jellyfin",
  aliases: ["jf"],
  settingsSchema: jellyfinSettingsSchema,

  configure(_settings: Record<string, string>): void {},

  async isConfigured(): Promise<boolean> {
    const stored = await getSettings(JELLYFIN_ID);
    return !!stored["url"];
  },

  async execute(args: string, context?: CommandContext): Promise<CommandResult> {
    const stored = await getSettings(JELLYFIN_ID);
    const jellyfinUrl = asString(stored["url"]);
    const apiKey = asString(stored["apiKey"]);

    if (!jellyfinUrl || !apiKey) {
      return {
        title: "Jellyfin Search",
        html: `<div class="command-result"><p>Jellyfin is not configured. Go to <a href="/settings">Settings → Plugins</a> to set up your Jellyfin URL and API key.</p></div>`,
      };
    }

    if (!args.trim()) {
      return {
        title: "Jellyfin Search",
        html: `<div class="command-result"><p>Usage: <code>!jellyfin &lt;search term&gt;</code></p></div>`,
      };
    }

    try {
      const term = args.trim();
      const page = context?.page ?? 1;
      const perPage = 25;
      const startIndex = (page - 1) * perPage;

      const authHeaders = { "X-Emby-Token": apiKey };
      const [hintsRes, peopleRes] = await Promise.all([
        fetch(`${jellyfinUrl}/Search/Hints?searchTerm=${encodeURIComponent(term)}&Limit=${perPage}&StartIndex=${startIndex}&IncludeItemTypes=Movie,Series,Episode,Audio,MusicAlbum,MusicArtist`, { headers: authHeaders }),
        fetch(`${jellyfinUrl}/Persons?searchTerm=${encodeURIComponent(term)}&Limit=5&Fields=Overview,PrimaryImageAspectRatio`, { headers: authHeaders }),
      ]);
      const hintsData = await hintsRes.json() as { SearchHints?: Record<string, unknown>[]; TotalRecordCount?: number };
      const peopleData = await peopleRes.json() as { Items?: Record<string, unknown>[] };

      const people = peopleData.Items || [];
      const personIds = people.map((p) => p["Id"]);

      let personItems: Record<string, unknown>[] = [];
      if (personIds.length > 0) {
        const personItemsRes = await fetch(
          `${jellyfinUrl}/Items?PersonIds=${personIds.join(",")}&Recursive=true&Limit=30&Fields=Overview,People&IncludeItemTypes=Movie,Series`,
          { headers: authHeaders },
        );
        const personItemsData = await personItemsRes.json() as { Items?: Record<string, unknown>[] };
        personItems = personItemsData.Items || [];
      }

      const seen = new Set<string>();
      const allItems: Record<string, unknown>[] = [];

      for (const hint of hintsData.SearchHints || []) {
        const id = String(hint["ItemId"] || "");
        if (id && !seen.has(id)) {
          seen.add(id);
          allItems.push({
            Id: id,
            Name: hint["Name"],
            Type: hint["Type"],
            ProductionYear: hint["ProductionYear"],
            Overview: hint["Overview"] || "",
            ImageTags: hint["PrimaryImageTag"] ? { Primary: hint["PrimaryImageTag"] } : {},
            MatchedFrom: "search",
          });
        }
      }

      for (const item of personItems) {
        const id = String(item["Id"] || "");
        if (id && !seen.has(id)) {
          seen.add(id);
          const itemPeople = (item["People"] as Record<string, unknown>[] | undefined) || [];
          const matchedPeople = itemPeople
            .filter((p) => String(p["Name"] || "").toLowerCase().includes(term.toLowerCase()))
            .map((p) => `${String(p["Name"])} (${String(p["Type"] || p["Role"] || "Cast")})`)
            .slice(0, 3);
          allItems.push({ ...item, MatchedFrom: "person", MatchedPeople: matchedPeople });
        }
      }

      if (allItems.length === 0) {
        return {
          title: "Jellyfin Search",
          html: `<div class="command-result"><p>No results found for "${escHtml(term)}"</p></div>`,
        };
      }

      const results = allItems
        .map((item) => {
          const name = escHtml(String(item["Name"] || ""));
          const overview = escHtml(String(item["Overview"] || ""));
          const year = item["ProductionYear"] ? ` (${item["ProductionYear"]})` : "";
          const typeBadge = `<span class="result-engine-tag">${escHtml(String(item["Type"] || ""))}</span>`;
          const jellyfinTag = `<span class="result-engine-tag">Jellyfin</span>`;
          const matchedPeople = item["MatchedPeople"] as string[] | undefined;
          const personInfo = matchedPeople?.length
            ? `<span class="result-engine-tag">${escHtml(matchedPeople.join(", "))}</span>`
            : "";
          const itemUrl = `${jellyfinUrl}/web/index.html#!/details?id=${item["Id"]}`;
          const imageTags = item["ImageTags"] as Record<string, unknown> | undefined;
          const hasThumb = !!imageTags?.["Primary"];
          const favicon = `<img class="result-favicon" src="${JELLYFIN_LOGO}" alt="">`;
          const thumbSrc = `/api/proxy/image?auth_id=${JELLYFIN_ID}&url=${encodeURIComponent(`${jellyfinUrl}/Items/${item["Id"]}/Images/Primary?maxHeight=120`)}`;
          const thumbBlock = hasThumb
            ? `<div class="result-thumbnail-wrap"><img class="result-thumbnail-img" src="${escHtml(thumbSrc)}" alt=""></div>`
            : "";
          return `<div class="result-item"><div class="result-item-inner"><div class="result-body"><div class="result-url-row">${favicon}<cite class="result-cite">${escHtml(jellyfinUrl)}</cite></div><a class="result-title" href="${escHtml(itemUrl)}" target="_blank">${name}${year}</a><p class="result-snippet">${overview}</p><div class="result-engines">${typeBadge}${jellyfinTag}${personInfo}</div></div>${thumbBlock}</div></div>`;
        })
        .join("");

      const totalHints = hintsData.TotalRecordCount ?? allItems.length;
      const totalPages = Math.ceil(totalHints / perPage);
      const pageInfo = totalPages > 1 ? ` — Page ${page} of ${totalPages}` : "";
      return {
        title: `Jellyfin: ${term} — ${totalHints} results${pageInfo}`,
        html: `<div class="command-result">${results}</div>`,
        totalPages,
      };
    } catch {
      return {
        title: "Jellyfin Search",
        html: `<div class="command-result"><p>Failed to connect to Jellyfin. Check your configuration.</p></div>`,
      };
    }
  },
};

export default jellyfinCommand;
