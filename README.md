# degoog

Search aggregator that queries multiple engines and shows results in one place. You can add custom search engines, bang-command plugins, and slot plugins (query-triggered panels above/below results or in the sidebar). News search uses configurable RSS feeds. The dream would be to eventually have a user made marketplace for plugins/engines.

**Still in beta.** Not intended for production use yet.

## Run

**Create a data folder and make sure it has the right user permissions**

```bash
services:
  degoog:
    image: ghcr.io/fccview/degoog:main
    volumes:
      - ./data:/app/data
    user: "1000:1000"
    ports:
      - "4444:4444"
    restart: unless-stopped
```

## Documentation

- [Environment variables](howto/ENV_VARIABLES.md) — port, plugin dirs, settings password
- [Adding a built-in engine](howto/ADD_NEW_ENGINES.md) — how to add engines to the codebase
- [Adding a built-in plugin](howto/ADD_NEW_PLUGINS.md) — how to add bang commands to the codebase
- [Custom search engines](howto/engines/README.md) — drop-in engines in `data/engines/`
- [Custom plugins](howto/plugins/README.md) — drop-in bang commands and slot plugins in `data/plugins/`
- [Command aliases](howto/aliases/README.md) — custom `!alias` → `!command` mappings

News search uses RSS: configure feed URLs in **Settings → Engines → News** (one URL per line, Save). Feeds are stored in `data/plugin-settings.json`. Leave empty to use default tech news feeds.
