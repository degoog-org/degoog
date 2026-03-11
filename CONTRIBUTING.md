# Some basic rules

- Fork `develop` and branch off it. Pull requests MUST be directed to the `develop` branch.
- For customisation and extensions, see the [documentation](docs/index.html). For adding built-in engines or bang commands, follow the patterns in `src/server/extensions/engines` and `src/server/extensions/commands/builtins`.
- If you use AI, ensure your code is reviewed, meets the coding standards below, and is not overly engineered.

# Coding standards

- **Functions that return a value** — use arrow functions (e.g. `const getX = () => value`).
- **Functions that do not return** (side-effect only) — use regular `function` declarations.
- **Internal / private helpers** — prepend with `_` (e.g. `_parseQuery`, `_formatDate`).
- **CSS** — Reuse existing app classes where possible (see [Styling](docs/styling.html) for a list). Must use SCSS/CSS variables (e.g. `$primary or var(--text-primary)`) so themes and light/dark mode keep working wel.
- **Structure** — Keep things modular; follow the existing folder structure (e.g. one folder per plugin, one file or folder per engine).
