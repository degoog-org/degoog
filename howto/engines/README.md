# Custom search engine plugins

Drop engine modules here to add them to degoog. Each file must export a **SearchEngine** object with:

- **`name`** (string) — display name shown in Settings → Engines
- **`executeSearch(query, page?, timeFilter?)`** (async function) — returns `Promise<SearchResult[]>`

**Optional properties:**

- **`bangShortcut`** (string) — enables a `!shortcut` to search this engine directly (e.g. `bangShortcut: "ex"` → `!ex linux`)
- **`settingsSchema`** (SettingField[]) — declares configurable fields; they appear as a card in Settings → Engines with a Configure modal
- **`configure(settings)`** (function) — called on startup (if settings exist) and whenever settings are saved in the UI

---

**SearchResult** shape:

```js
{
  title: string,
  url: string,
  snippet: string,
  source: string,
  thumbnail?: string,
  duration?: string,
}
```

**SettingField** shape:

```js
{
  key: string,
  label: string,
  type: "text" | "password" | "url" | "toggle",
  required?: boolean,
  placeholder?: string,
  description?: string,
  secret?: boolean, // value is never sent to the browser; stored server-side only
}
```

---

## Setup

Create a `./data/engines` folder at the project root, or set `DEGOOG_ENGINES_DIR` to load from a different directory.

Supported extensions: `.js`, `.ts`, `.mjs`, `.cjs`.

The engine id is derived from the filename with an `engine-` prefix (e.g. `my-engine.js` → id `engine-my-engine`).

To export a non-web search type, add a named `type` export:

```js
export const type = "images"; // "images" | "videos" | "web" (default)
```

News is not an engine type: the News tab uses RSS feeds configured in **Settings → Engines → News** (stored in `data/plugin-settings.json`).

## How settings work

1. Declare `settingsSchema` on your engine — this makes a Configure button appear in Settings → Engines.
2. The user fills in and saves the form. The values are stored in `data/plugin-settings.json` server-side (along with News RSS feed URLs and other extension settings).
3. `configure(settings)` is called immediately after save, and also on every server restart if settings already exist.
4. Return an empty array from `executeSearch` when required settings are missing — the engine will simply contribute no results.

See `example.js` in this folder for a complete working example.
