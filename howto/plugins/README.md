# Custom plugins (commands and slots)

Plugins live in `data/plugins/` (or `DEGOOG_PLUGINS_DIR`). A module can export a **BangCommand**, a **SlotPlugin**, or both.

---

## Bang command plugins

Drop plugin modules here to add them to degoog. Each file may export a **BangCommand** object with:

- **`name`** (string) — display name shown in Settings and `!help`
- **`description`** (string) — short description shown in `!help`
- **`trigger`** (string) — the word after `!` that activates the command
- **`execute(args, context?)`** (async function) — returns `Promise<CommandResult>`

**Optional properties:**

- **`aliases`** (string[]) — additional triggers for the same command
- **`settingsSchema`** (SettingField[]) — declares configurable fields; they appear as a card in Settings → Plugins with a Configure modal
- **`configure(settings)`** (function) — called on startup (if settings exist) and whenever settings are saved in the UI; use it to load config values into local variables
- **`isConfigured()`** (async function) — return `false` to hide the command from `!help` until required settings are filled in

---

**CommandResult** shape:

```js
{ title: string, html: string, totalPages?: number }
```

**CommandContext** shape:

```js
{ clientIp?: string, page?: number }
```

---

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

Create a `./data/plugins` folder at the project root, or set `DEGOOG_PLUGINS_DIR` to load from a different directory.

Supported extensions: `.js`, `.ts`, `.mjs`, `.cjs`.

The plugin id is derived from the filename with a `plugin-` prefix (e.g. `my-plugin.js` → id `plugin-my-plugin`).

## How settings work

1. Declare `settingsSchema` on your plugin — this makes a Configure button appear in Settings → Plugins.
2. The user fills in and saves the form. The values are stored in `data/plugin-settings.json` server-side.
3. `configure(settings)` is called immediately after save, and also on every server restart if settings already exist.
4. Implement `isConfigured()` to return `false` when required settings are missing — this hides the command from `!help` until it is ready.

See [data/plugins/weather.js](data/plugins/weather.js) for a fully working drop-in weather plugin.

Bang commands appear in Settings with type **command**.

---

## Slot plugins

Slot plugins inject panels into the search results page when the query matches. They are **stackable**: if multiple slot plugins match, all their panels are shown. Export a **slot** (or **slotPlugin**) from the same module that may export a BangCommand:

- **`id`** (string) — unique id for the slot
- **`name`** (string) — display name
- **`position`** — `"above-results"` | `"below-results"` | `"sidebar"` (where the panel is rendered)
- **`trigger(query)`** (function) — return true if the slot should show for this query (e.g. keyword or regex match)
- **`execute(query, context?)`** (async function) — returns `Promise<{ title?: string, html: string }>` (panel content)

Optional: **`settingsSchema`**, **`configure(settings)`** (settings stored under `slot-<id>` in plugin-settings).

See [data/plugins/imdb-slot.js](data/plugins/imdb-slot.js) for a fully working slot imdb plugin.

Slot panels are rendered in three positions: above the results list, below the results list, and in the results sidebar. All positions are available by default.
