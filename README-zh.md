<p align="center">
  <img src="src/public/images/degoog-logo.png" alt="Degoog Logo" width="100">
  <br />
  <h1 align="center">degoog</h1><br/>
</p>

搜索聚合器，查询多个引擎并在一处显示结果。你可以添加自定义搜索引擎、bang 命令插件、slot 插件（查询触发的结果上方/下方或侧边栏面板）和 transports（自定义 HTTP 获取策略，如 curl、FlareSolverr 或你自己的）。最终梦想是拥有一个用户创建的插件/引擎市场。

**仍在测试阶段。** 目前不建议用于生产环境。

---

<p align="center">
  <a href="https://discord.gg/invite/mMuk2WzVZu">
    <img width="40" src="https://skills.syvixor.com/api/icons?i=discord">
  </a>
  <br />
  <i>加入我们的 Discord 社区</i>
  <br />
</p>

---

<div align="center">
  <img width="800" src="screenshots/home.png">
</div>

## 运行

默认情况下，应用将在端口 `4444` 上运行，用户为 `1000:1000`，请查看[文档](https://degoog-org.github.io/degoog/env.html)获取环境变量的完整列表和各种注意事项。

```bash
mkdir -p ./data
sudo chown -R 1000:1000 ./data
```

<details>
<summary>Docker Compose</summary>

```yaml
services:
  degoog:
    image: ghcr.io/degoog-org/degoog:latest
    volumes:
      - ./data:/app/data
    ports:
      - "4444:4444"
    restart: unless-stopped
```

</details>

<details>
<summary>Docker CLI</summary>

```bash
docker run -d \
  --name degoog \
  -v ./data:/app/data \
  -p 4444:4444 \
  --restart unless-stopped \
  ghcr.io/degoog-org/degoog:latest
```

</details>

<details>
<summary>从源代码构建</summary>

```bash
git clone https://github.com/degoog-org/degoog.git
cd degoog
npm install
npm run build
npm start
```

</details>

## 功能特性

- 🔍 **多引擎搜索** — 同时查询多个搜索引擎
- 🎯 **自定义引擎** — 添加你自己的搜索引擎
- 💥 **Bang 命令** — 使用 `!` 前缀快速跳转到特定搜索引擎
- 📌 **Slot 插件** — 在结果上方/下方或侧边栏显示自定义面板
- 🔄 **Transports** — 自定义 HTTP 获取策略
- 🎨 **主题支持** — 多种主题可选
- 📱 **响应式设计** — 支持移动设备
- 🔒 **隐私友好** — 不跟踪用户搜索

## 配置

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务器端口 | `4444` |
| `HOST` | 服务器主机 | `0.0.0.0` |
| `DATA_DIR` | 数据目录 | `./data` |

### 自定义引擎

在 `data/engines.json` 中添加自定义引擎：

```json
{
  "my-engine": {
    "name": "My Engine",
    "url": "https://example.com/search?q={query}",
    "icon": "🔍"
  }
}
```

### Bang 命令

使用 `!` 前缀触发特定引擎：

- `!g query` — 搜索 Google
- `!ddg query` — 搜索 DuckDuckGo
- `!gh query` — 搜索 GitHub

## 开发

```bash
git clone https://github.com/degoog-org/degoog.git
cd degoog
npm install
npm run dev
```

## 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解指南。

## 许可证

MIT
