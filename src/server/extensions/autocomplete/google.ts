import type {
  AutocompleteProvider,
  AutocompleteContext,
  AutocompleteSuggestion,
  RichSuggestion,
} from "../../types";
import { asBoolean } from "../../utils/plugin-settings";
import type { SettingValue } from "../../utils/plugin-settings";

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

  configure(settings: Record<string, SettingValue>): void {
    this.richEnabled = asBoolean(settings.richSuggestions);
  }

  async getSuggestions(
    query: string,
    context?: AutocompleteContext,
  ): Promise<AutocompleteSuggestion[]> {
    const doFetch = context?.fetch ?? fetch;
    const encoded = encodeURIComponent(query);

    try {
      if (this.richEnabled) {
        const url = `https://www.google.com/complete/search?q=${encoded}&client=gws-wiz&xssi=t&hl=${context?.lang || "en"}`;
        const res = await doFetch(url);
        const buf = await res.arrayBuffer();
        let text = new TextDecoder("iso-8859-1").decode(buf);
        if (text.startsWith(")]}'")) text = text.substring(4);
        const data = JSON.parse(text);
        const suggestionsData = data[0] || [];

        return suggestionsData.map(
          (
            item: [string, string, string, { zi?: string; zs?: string }],
          ): AutocompleteSuggestion => {
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
          },
        );
      } else {
        const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encoded}`;
        const res = await doFetch(url);
        const buf = await res.arrayBuffer();
        const text = new TextDecoder("iso-8859-1").decode(buf);
        return (JSON.parse(text) as [unknown, string[]])[1] ?? [];
      }
    } catch {
      return [];
    }
  }
}
