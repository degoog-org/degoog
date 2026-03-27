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

By default the app will run on port `4444`, please check the [documentation](https://fccview.github.io/degoog/env.html) for a comprehensive list of env variables and various nuances.

```bash
mkdir -p ./data
sudo chown -R 1000:1000 ./data
```

<details>
<summary>Docker Compose</summary>

```yaml
services:
  degoog:
    image: ghcr.io/fccview/degoog:latest
    volumes:
      - ./data:/app/data
    ports:
      - "4444:4444"
    restart: unless-stopped
```

</details>

<details>
<summary>Inline podman</summary>

```bash
podman run -d --name degoog -p 4444:4444 -v ./data:/app/data --user 1000:1000 --security-opt label=disable --restart unless-stopped ghcr.io/fccview/degoog:latest
```

</details>

<details>
<summary>Podman Quadlet Container File</summary>

```yaml
[Unit]
Description=Degoog selfhosted search aggregator
Wants=network-online.target
After=network-online.target

[Container]
Image=ghcr.io/fccview/degoog:latest
AutoUpdate=registry
ContainerName=degoog
Environment=TZ=<Country/City>
Environment=PUID=1000
Environment=PGID=1000
# Environment=DEGOOG_PUBLIC_INSTANCE=true # Add if public
UIDMap=+%U:@%U
Volume=<Path to config>:/app/data:Z
PublishPort=4444:4444
Network=degoog

[Service]
Restart=always

[Install]
WantedBy=default.target
```

</details>


</details>

<details>
<summary>Inline docker</summary>

```bash
docker run -d --name degoog -p 4444:4444 -v ./data:/app/data --user "1000:1000" --restart unless-stopped ghcr.io/fccview/degoog:latest
```

</details>

<details>
<summary>Run natively</summary>

You'll need a `.env` file for your env variables and the following required dependencies:

- [bun](https://bun.sh)
- [git](https://git-scm.com)

```bash
git clone https://github.com/fccview/degoog.git
cd degoog
bun install
bun run build
bun run start
```

**note**: If HTTPS requests fail with certificate errors, install the `ca-certificates` package

</details>

<details>
<summary>Proxmox VE Script</summary>

The community Proxmox script exists, but it is currently marked as in development and not recommended for production use:

https://proxmox-scripts.com/posts/degoog

</details>

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

| name                 | url                                                     |
| :------------------- | :------------------------------------------------------ |
| official store       | `https://github.com/fccview/fccview-degoog-extensions`  |
| Subatomic1618 addons | `https://codeberg.org/Subatomic1618/degoog-addons.git`  |
| Weeb Paradise        | `https://codeberg.org/fccview/degoog-weeb-paradise.git` |
| Georgvwt stuff       | `https://github.com/Georgvwt/georgvwt-degoog-stuff.git` |
| Lazerleif Maps       | `https://github.com/lazerleif/degoog-maps.git`          |

## Documentation

Full customisation guide (plugins, themes, engines, store, settings gate, aliases, env): **[documentation](https://fccview.github.io/degoog)**.

## Little shoutout

This project would have never existed if the amazing [searxng](https://github.com/searxng/searxng) developers hadn't had the idea first. This is my take on a heavily customisable search aggregrator, it's meant to be a more modular lighter alternative, you can add as much as you want to it, but the core will stay as simple as it gets.

Alternatives are what make the internet a fun place, let me share a few other aggregators you may want to try out, the beauty of open source is that there's no competition (or at least there shouldn't be, none of us do this shit for money after all).

| name       | repo                                 |
| :--------- | :----------------------------------- |
| searxng    | https://github.com/searxng/searxng   |
| 4get       | https://git.lolcat.ca/lolcat/4get    |
| OmniSearch | https://git.bwaaa.monster/omnisearch |
| LibreY     | https://github.com/Ahwxorg/LibreY    |

[![Star History Chart](https://api.star-history.com/image?repos=fccview/degoog&type=date&legend=top-left)](https://www.star-history.com/?repos=fccview%2Fdegoog&type=date&legend=top-left)
