import type {
  AutocompleteProvider,
  AutocompleteContext,
  AutocompleteSuggestion,
  RichSuggestion,
} from "../../types";

export class DuckDuckGoAutocompleteProvider implements AutocompleteProvider {
  name = "DuckDuckGo";

  settingsSchema = [
    {
      key: "richSuggestions",
      label: "Rich suggestions",
      type: "toggle" as const,
      default: "false",
      description:
        "Show entity cards (image, description) at the top of suggestions when available. Uses the DuckDuckGo Instant Answer API (This means an extra call for each suggestion, careful with usage)",
      advanced: false,
    },
  ];

  private richEnabled = false;

  configure(settings: Record<string, string | string[]>): void {
    this.richEnabled = settings.richSuggestions === "true";
  }

  async getSuggestions(
    query: string,
    context?: AutocompleteContext,
  ): Promise<AutocompleteSuggestion[]> {
    const doFetch = context?.fetch ?? fetch;
    const encoded = encodeURIComponent(query);

    const [suggestRes, richRes] = await Promise.allSettled([
      doFetch(`https://duckduckgo.com/ac/?q=${encoded}&type=list`),
      this.richEnabled
        ? doFetch(
            `https://api.duckduckgo.com/?q=${encoded}&format=json&no_redirect=1&no_html=1&skip_disambig=1`,
          )
        : Promise.resolve(null),
    ]);

    const suggestions: string[] =
      suggestRes.status === "fulfilled"
        ? ((
            (await suggestRes.value.json().catch(() => [null, []])) as [
              unknown,
              string[],
            ]
          )[1] ?? [])
        : [];

    let rich: (AutocompleteSuggestion & object) | null = null;
    if (
      this.richEnabled &&
      richRes.status === "fulfilled" &&
      richRes.value !== null
    ) {
      try {
        const ia = (await richRes.value.json()) as {
          Heading?: string;
          AbstractText?: string;
          Image?: string;
          Entity?: string;
        };
        if (ia.Heading && ia.AbstractText) {
          const richData: RichSuggestion = {};
          if (ia.AbstractText) richData.description = ia.AbstractText;
          if (ia.Image)
            richData.thumbnail = `https://duckduckgo.com${ia.Image}`;
          if (ia.Entity) richData.type = ia.Entity;
          rich = { text: ia.Heading, rich: richData };
        }
      } catch {
        rich = null;
      }
    }

    const results: AutocompleteSuggestion[] = [];
    if (rich) results.push(rich);
    for (const s of suggestions) {
      if (
        rich !== null &&
        typeof rich === "object" &&
        s.toLowerCase() === (rich as { text: string }).text.toLowerCase()
      )
        continue;
      results.push(s);
    }
    return results;
  }
}
