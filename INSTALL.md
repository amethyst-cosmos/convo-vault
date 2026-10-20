# 给 Agent：安装并使用 Convo Vault

用户让你“安装这个项目”时，按下面的步骤做。目标：装好后，用户只需对你说“导出这个 ChatGPT 对话 <链接或截图>”。

## 安装

1. **确定位置**：用户没指定就装到 `~/convo-vault`。
2. **取代码**：`git clone --depth 1 https://github.com/amethyst-cosmos/convo-vault.git <位置>`。没有 git 就下载最新 Release 的 zip 解压。
3. **检查 Node 20+**：`node -v`。没有或版本过低，先帮用户装（macOS `brew install node`，Windows `winget install OpenJS.NodeJS.LTS`，或用户已有的 mise/nvm）。
4. **运行安装**：

   ```bash
   cd <位置> && node scripts/convo-vault.mjs setup
   ```

   它会装渲染依赖、构建扩展，把 skill 装进 Claude 和 Codex（找到哪个装哪个），并打开浏览器的扩展页面。用户常用的浏览器不是 Chrome 时加 `--browser edge`（或 brave）。
5. **让用户在浏览器里加载扩展（只此一步需要人手，一次性）**：
   1. 打开扩展页面（`chrome://extensions` 或 `edge://extensions`），开启右上角“开发者模式”；
   2. 点“加载已解压的扩展程序”，选择 `<位置>/dist/convo-vault-extension`；
   3. 在这个浏览器里登录 ChatGPT。

   浏览器不允许程序自动安装未上架的扩展，所以这一步不要假装能替用户完成。
6. **验证**：`node scripts/convo-vault.mjs verify`。它打开一个 ChatGPT 页面并确认扩展有响应，通过会输出 `OK`。失败就把输出里的提示转告用户，让用户完成第 5 步后重试。
7. **可选，给 Claude 桌面版的普通聊天用**（不是 Code 标签）：`node scripts/convo-vault.mjs mcp install`，然后让用户完全退出并重开 Claude 桌面版。其他支持 MCP 的客户端用 `node scripts/convo-vault.mjs mcp config` 打印的配置。
8. **告诉用户**：新装的 skill 要在新开的会话里才会生效，请重开一个会话。

## 使用

用户给出对话链接或截图（地址栏里有 `chatgpt.com/c/<id>`），运行：

```bash
node <位置>/scripts/convo-vault.mjs export "<链接>"
```

默认 Fast 模式，结果在 `~/Downloads/convo-vault/<标题>/`。不要让用户选模式或点面板。详细规则见已安装的 `convo-vault` skill。

## 更新与排错

- 更新：`node <位置>/scripts/convo-vault.mjs update`（拉取最新代码并重新安装）；扩展已加载的话，提醒用户在扩展页面点一下重新加载。
- 自检：`node <位置>/scripts/convo-vault.mjs doctor`。
- 渲染服务由导出命令自动启动，日志在 `<位置>/.convo-vault/backend.log`。

## 不要做

- 不要读取、索要或粘贴用户的 ChatGPT Cookie、令牌或密码；扩展使用浏览器里已登录的会话。
- 不要把对话内容上传到任何在线服务；一切都在本机。
- 用户没同意前，不要用 `--allow-incomplete` 导出不完整的抓取。
