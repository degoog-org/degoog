# Custom themes

Themes live in `data/themes/` (or `DEGOOG_THEMES_DIR`). Each theme is a **folder** named by its id (e.g. `1999`), containing at least a **theme.json** manifest.

---

## Theme manifest (theme.json)

Required:

- **`name`** (string) — display name in Settings → Themes

Optional:

- **`author`** (string)
- **`description`** (string) — shown on the theme card
- **`version`** (string)
- **`css`** (string) — stylesheet path relative to the theme folder (e.g. `style.css` or `style.scss`). SCSS is compiled at load. When the theme is active this file is served at `/theme/style.css`.
- **`html`** (object) — full HTML overrides. Keys: `index`, `search`. Value is the filename in the theme folder (e.g. `"index": "index.html"`). When the theme is active, that file is served instead of the built-in home or search page.
- **`settingsSchema`** (array) — optional. If present, a Configure button appears on the theme card; values are stored in `data/plugin-settings.json` under `theme-<theme-id>`. Same field shape as plugins (key, label, type: text | password | url | toggle | textarea, etc.).

---

## Setup

Create `./data/themes` (or set `DEGOOG_THEMES_DIR`). Each theme is a **subfolder** (e.g. `data/themes/my-theme/`) with:

- **theme.json** (required)
- **style.css** or **style.scss** (optional) — use the same CSS variables as the app (`--bg`, `--text-primary`, `--text-link`, etc.) so light/dark work. See `src/public/style.css` for the variable set.
- **index.html**, **search.html** (optional) — only used if listed under `html` in theme.json.

Theme id = folder name.

---

## Applying a theme

Settings → Themes → choose a theme → **Apply**. The active theme id is stored in `data/plugin-settings.json` as `theme.active` (e.g. `"theme": { "active": "1999" }`).

---

## Example

**[data/themes/1999](data/themes/1999)** — `theme.json`, `style.css`, and optional `index.html` / `search.html` overrides. Uses the app’s CSS variables; supports light/dark via `[data-theme="light"]` and `[data-theme="dark"]`.
