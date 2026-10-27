# 给 Agent：安装并使用 Convo Vault

[English](INSTALL.md)

用户让你“安装这个项目”时，按下面的步骤做。目标：装好后，用户只需对你说“导出这个 ChatGPT 对话 <链接或截图>”。

## 安装

1. **确定位置**：用户没指定就装到 `~/convo-vault`。
2. **取代码**：下面这条会跳过只有开发者才需要的文件（测试、文档图片、CI）：

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/amethyst-cosmos/convo-vault.git <位置> && git -C <位置> sparse-checkout set --no-cone '/*' '!/tests/' '!/docs/' '!/.github/' '!/AGENTS.md' '!/CONTRIBUTING.md' '!/eslint.config.mjs'
   ```

   如果失败（git 太旧），改用 `git clone --depth 1 https://github.com/amethyst-cosmos/convo-vault.git <位置>`。没有 git 就下载最新 Release 的 zip 解压。
3. **检查 Node 20+**：`node -v`。没有或版本过低，先帮用户装（macOS `brew install node`，Windows `winget install OpenJS.NodeJS.LTS`，或用户已有的 mise/nvm）。
4. **运行安装**：

   ```bash
   cd <位置> && node cli/convo-vault.mjs setup
   ```

   它会装渲染依赖、构建扩展，把 skill 装进 Claude 和 Codex（找到哪个装哪个），并打开浏览器的扩展页面。用户常用的浏览器不是 Chrome 时加 `--browser edge`（或 brave）。
5. **让用户在浏览器里加载扩展（只此一步需要人手，一次性）**：
   1. 打开扩展页面（`chrome://extensions` 或 `edge://extensions`），开启右上角“开发者模式”；
   2. 点“加载已解压的扩展程序”，选择 `<位置>/dist/convo-vault-extension`；
   3. 在这个浏览器里登录 ChatGPT。

   浏览器不允许程序自动安装未上架的扩展，所以这一步不要假装能替用户完成。
6. **验证**：`node cli/convo-vault.mjs verify`。它打开一个 ChatGPT 页面并确认扩展有响应，通过会输出 `OK: Extension <版本> answered in <浏览器>`；如果这个版本和本项目（`extension/manifest.json`）的不同，它会建议运行 `node cli/convo-vault.mjs reload` 或在扩展页面点重新加载。失败就把输出里的提示转告用户，让用户完成第 5 步后重试。
7. **可选，给 Claude 桌面版的普通聊天用**（不是 Code 标签）：`node cli/convo-vault.mjs mcp install`，然后让用户完全退出并重开 Claude 桌面版。其他支持 MCP 的客户端用 `node cli/convo-vault.mjs mcp config` 打印的配置。
8. **告诉用户**：新装的 skill 要在新开的会话里才会生效，请重开一个会话。

## 使用

用户给出对话链接或截图（地址栏里有 `chatgpt.com/c/<id>`），运行：

```bash
node <位置>/cli/convo-vault.mjs export "<链接>"
```

导出整段对话，结果在 `~/Downloads/convo-vault/<标题>/`。不要让用户选任何东西或点弹窗。详细规则见已安装的 `convo-vault-skill`。

## 把一切放在同一个文件夹

默认情况下 Convo Vault 会写到项目之外：配置在 `~/.convo-vault`，skill 在 `~/.claude/skills` 和 `~/.codex/skills`，导出在 `~/Downloads/convo-vault`。想全部放在一个文件夹里（例如你被限制在工作目录内）：

- `CONVO_VAULT_HOME=<文件夹>` 移动配置文件夹，每条命令都要带上，例如 `CONVO_VAULT_HOME=$PWD/.state node cli/convo-vault.mjs setup`。
- `--out <文件夹>` 指定导出位置，例如 `node cli/convo-vault.mjs export "<链接>" --out ./exports`。
- `setup --no-skill` 跳过安装 skill；或用 `skill install --dir <文件夹>` 把 skill 装到你选的文件夹。

被限制在工作目录内的 Agent，写 `~/.claude`、`~/.codex` 和 `~/.convo-vault` 需要用户批准。skill 写不进去时 `setup` 仍会完成，只对 skill 给出警告。设置 `CONVO_VAULT_HOME` 可让配置也留在你的文件夹里。

## 更新与排错

- 更新：`node <位置>/cli/convo-vault.mjs update`（拉取最新代码并重新安装）；扩展已加载的话，提醒用户在扩展页面点一下重新加载。
- 自检：`node <位置>/cli/convo-vault.mjs doctor`。
- 渲染服务由导出命令自动启动，日志在 `<位置>/.convo-vault/backend.log`。

## 不要做

- 不要读取、索要或粘贴用户的 ChatGPT Cookie、令牌或密码；扩展使用浏览器里已登录的会话。
- 不要把对话内容上传到任何在线服务；一切都在本机。
- 用户没同意前，不要用 `--allow-incomplete` 导出不完整的抓取。
