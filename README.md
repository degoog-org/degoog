<p align="center">
  <img src="src/public/images/degoog-logo.png" alt="Degoog Logo" width="100"> 
  <br />
  <h1 align="center">degoog</h1><br/>
</p>

Search aggregator that queries multiple engines and shows results in one place. You can add custom search engines, bang-command plugins, and slot plugins (query-triggered panels above/below results or in the sidebar). News search uses configurable RSS feeds. The dream would be to eventually have a user made marketplace for plugins/engines.

**Still in beta.** Not intended for production use yet.

---

<p align="center">
  <a href="https://discord.gg/invite/mMuk2WzVZu">
    <img width="40" src="https://skills.syvixor.com/api/icons?i=discord">
  </a>
  <br />
  <i>Join our discord community</i>
  <br />
</p>

---

<div align="center">
  <img width="800" src="screenshots/home.png">
</div>

## Run

**Create a data folder and make sure it has the right user permissions**

```bash
services:
  degoog:
    image: ghcr.io/fccview/degoog:latest
    volumes:
      - ./data:/app/data
    user: "1000:1000"
    ports:
      - "4444:4444"
    restart: unless-stopped
```

<p align="center">
  <br />
  <a href="https://www.buymeacoffee.com/fccview">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy me a coffee" width="150">
  </a>
</p>

## Store repositories

Official fccview store: `https://github.com/fccview/fccview-degoog-extensions`

## Documentation

Full customisation guide (plugins, themes, engines, store, settings gate, aliases, env): **[https://fccview.github.io/degoog](documentation)**.

## Little shoutout

This project would have never existed if the amazing [searxng](https://github.com/searxng/searxng) developers hadn't had the idea first. This is my take on a heavily customisable search aggregrator, it's meant to be a more modular lighter alternative, you can add as much as you want to it, but the core will stay as simple as it gets.

[![Star History Chart](https://api.star-history.com/image?repos=fccview/degoog&type=date&legend=top-left)](https://www.star-history.com/?repos=fccview%2Fdegoog&type=date&legend=top-left)
