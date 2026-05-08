import type {
  AutocompleteProvider,
  AutocompleteContext,
  AutocompleteSuggestion,
  RichSuggestion,
} from "../../types";

export class GoogleAutocompleteProvider implements AutocompleteProvider {
  name = "Google";

  settingsSchema = [
    {
      key: "richSuggestions",
      label: "Rich suggestions",
      type: "toggle" as const,
      default: "false",
      description:
        "Show entity cards (image, description) at the top of suggestions when available. Switches to the Chrome client endpoint.",
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

    try {
      const url = this.richEnabled
        ? `https://www.google.com/complete/search?q=${encoded}&client=gws-wiz&xssi=t&hl=${context?.lang || "en"}`
        : `https://suggestqueries.google.com/complete/search?client=firefox&q=${encoded}`;
      const res = await doFetch(url);
      const buf = await res.arrayBuffer();
      let text = new TextDecoder("utf-8").decode(buf);

      if (this.richEnabled) {
        if (text.startsWith(")]}'")) text = text.substring(4);
        const data = JSON.parse(text);
        const suggestionsData = data[0] || [];

        return suggestionsData.map((item: any): AutocompleteSuggestion => {
          const rawText = (item[0] || "")
            .replace(/<\/?b>/gi, "")
            .replace(/&#39;/g, "'");
          const meta = item[3];
          if (!meta) return rawText;

          const rich: RichSuggestion = {};
          if (meta.zi) rich.description = meta.zi;
          if (meta.zs) rich.thumbnail = meta.zs;

          return Object.keys(rich).length > 0
            ? { text: rawText, rich }
            : rawText;
        });
      } else {
        const data = JSON.parse(text);
        return (data as [unknown, string[]])[1] ?? [];
      }
    } catch {
      return [];
    }
  }
}
