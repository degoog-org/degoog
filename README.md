<p align="center">
  <img src="src/public/images/degoog-logo.png" alt="Degoog Logo" width="100"> 
  <br />
  <h1 align="center">degoog</h1><br/>
</p>

Search aggregator that queries multiple engines and shows results in one place. You can add custom search engines, bang-command plugins, and slot plugins (query-triggered panels above/below results or in the sidebar). The dream would be to eventually have a user made marketplace for plugins/engines.

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

## Public instances

Some amazing people around the web decided to make their degoog instances available for everyone to use, and they 100% deserve a shout-out! Check out the full list [here](docs/repo/PUBLIC_INSTANCES.md)

## Store repositories

Aside from the official store these are third party repositories, they have been vetted once before adding them to the readme but I will not personally keep an eye on all of them, it's your responsibility to make sure what you install on your instance. I love open source and I'll obviously try to add these for as long as it's manageable to do so, eventually I may need a system for it, but for now they're comfy in the readme.

| name                 | url                                                    |
| :------------------- | :----------------------------------------------------- |
| official store       | `https://github.com/fccview/fccview-degoog-extensions` |
| Subatomic1618 addons | `https://codeberg.org/Subatomic1618/degoog-addons.git` |
| Weeb Paradise | `https://codeberg.org/fccview/degoog-weeb-paradise.git` |
| Georgvwt everforest theme | `https://github.com/Georgvwt/degoog-everforest-theme.git` |

## Documentation

Full customisation guide (plugins, themes, engines, store, settings gate, aliases, env): **[https://fccview.github.io/degoog](documentation)**.

## Little shoutout

This project would have never existed if the amazing [searxng](https://github.com/searxng/searxng) developers hadn't had the idea first. This is my take on a heavily customisable search aggregrator, it's meant to be a more modular lighter alternative, you can add as much as you want to it, but the core will stay as simple as it gets.

[![Star History Chart](https://api.star-history.com/image?repos=fccview/degoog&type=date&legend=top-left)](https://www.star-history.com/?repos=fccview%2Fdegoog&type=date&legend=top-left)
