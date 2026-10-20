# AGENTS.md - Convo Vault Agent Execution Guidelines

## 1. 核心执行准则：全自动自主执行 (Autonomous Direct Execution)

- **直接执行，禁止中途请示**：
  - 遇到任务时，默认直接执行所需的文件读取、代码编辑、环境检查与终端命令。
  - 严禁中途停顿输出“我准备进行以下操作，是否允许？”等询问。
  - 遇到需要跑多步的开发或排查任务，一步到位执行到底并验证，直接向用户呈现最终结果。

- **禁用阻塞性交互弹窗 (No Blocking Modals)**：
  - 严禁调用 `ask_question` 等弹出选择框阻塞工作流。
  - 若遇未明确指定的技术细节或实现方案，以通用最佳实践、当前项目已有架构风格为准，自主决策并继续推进。

- **自动调试与闭环验证 (Self-Healing Loop)**：
  - 运行命令或测试（如 `npm test`、`npm run check`、`python` 脚本）如果遇到报错，自主读取错误日志、修改代码并重新运行，直到通过验证。

---

## 2. 项目架构与规范 (Convo Vault Conventions)

- **项目类型**：Chrome 扩展程序 (Manifest V3)，基于原生 JavaScript / Node.js 测试套件构建。
- **进度与历史规范**：参考根目录下的 [CURRENT_PROGRESS.md](file:///d:/AI/convo-vault/CURRENT_PROGRESS.md)。导出规范以 Agent-Ready 通用知识包为准。
- **数据完整性门禁 (Integrity Gate)**：
  - 只有 Fast（读 ChatGPT 对话接口），不滚动、不点击页面；Full 和 Hybrid 已删除。
  - 思考过程以 API 里的有序记录（`agent-trace`）为准，不依赖页面。
  - 严格保持消息序列完整性，杜绝序号跳跃与角色异常。
- **仓库布局**：
  - `extension/`：浏览器加载的全部源码，`manifest.json`、`background.js`、`popup/`、`icons/`、`content/`。
  - `renderer/`：本地渲染服务（原 `tools/advanced-pdf`）。`server.js` 是 HTTP 入口，`render.js` 是 payload→HTML→PDF 的命令行，`lib/` 按职责拆分（`config`、`http-utils`、`jobs`、`export-sessions`、`bundle`、`zip`、`bundle-content`、`agent-trace-files`、`assets`、`document`/`messages`/`markdown`/`math`/`charts`/`mermaid`/`images`/`text`/`util`、`pagination`、`pdf`、`dil-runtime`），`static/` 放样式表和头像。
  - `cli/`：用户命令行 `convo-vault.mjs`（`export`/`setup`/`verify`/`doctor`/`update`/`skill install`/`mcp`/`backend`）、`mcp-server.mjs` 和 `lib/`；`start-local-backend.mjs` 供扩展弹窗的 Copy Start 使用。
  - `scripts/`：仓库自己的工具，`build-extension.mjs`、`check.mjs`、`package-release.mjs`、`lib/`（内容脚本拼装、zip 写入）。
  - `skills/convo-vault/`：自成一体的 skill 文件夹（`SKILL.md`、`scripts/run.mjs`、`agents/openai.yaml`）。`run.mjs` 找到或安装项目后运行命令行；`SKILL.md` 里的 `{{SKILL_DIR}}` 在 `skill install` 时替换成目标文件夹路径。
  - `tests/`、`docs/`（只放图片）。`content.js` 不再提交，只在 `dist/` 里生成。
- **内容脚本模块**：`npm run build:extension` 从 `extension/content/index.js` 生成 `dist/convo-vault-extension/content.js`，`// @convo-vault-include <name>` 按 `scripts/lib/content-build.mjs` 的 `INCLUDE_FILES` 原位展开，所有模块共享同一个作用域，新增模块要在 `INCLUDE_FILES` 里登记。`capture-orchestrator` 采集入口与一键导出（`exportCurrentConversation`）；`capture-fast` 读对话接口并生成消息；`agent-trace` 回答过程的有序事件记录（思考、工具调用、来源，PDF 思考时间线和 agent-trace 文件的唯一来源，已用 4 个真实对话验证与页面思考面板内容完全相同）；`conversation-manifest` 完整性清单；`capture-validation` 完整性报告；`chatgpt-markup`/`chatgpt-dom` ChatGPT 格式适配；`bundle-export` 导出与图片下载；`auto-export` 自动导出任务（URL 哈希 `#convo-vault-job=<id>` 触发，认领、读取、过完整性闸门、导出并回报；`ping` 和 `reload` 是任务的两种特殊类型）；`message-snapshot`/`debug-log`/`text-utils` 等小工具。新增模块要在 `INCLUDE_FILES` 里登记。
- **命令行与 Skill**：`cli/convo-vault.mjs` 经本地渲染服务的 `/jobs` 接口让扩展自动导出；`npm run package` 生成发布包，推送 `v*` 标签由 `.github/workflows/release.yml` 发布。
- **生成式界面 (DIL)**：Fast 把 `metadata.model_dil_v2` 打包为消息的 `dil` 字段，`renderer/lib/dil-runtime.js` 在 PDF 页面里执行并绘制；页面 CSP 禁止一切网络请求，失败时显示 Markdown fallback。
- **每次交付都升版本号**：任何交给用户安装或测试的代码改动，都至少提升补丁版本，并同步 `package.json`、`renderer/package.json`、`extension/manifest.json`、`extension/content/index.js` 的 `EXPORTER_VERSION`、`extension/popup/popup.html`、`tests/version.test.mjs`、`README.md` 与 `README.zh-CN.md` 的“当前版本”和更新说明（`README.md` 是英文默认版），以及 `CHANGELOG.md`、`CHANGELOG.zh-CN.md`，让用户能从面板和扩展页面看出装的是哪一版。`tests/version.test.mjs` 会检查。

---

## 3. 常用开发与验证命令

在 Windows PowerShell 环境下运行：
- **测试套件**：`npm test`
- **代码与 JSON 校验**：`npm run check`
- **Fixture 完整测试**：`npm run test:fixtures`
- **构建扩展**：`npm run build:extension`
