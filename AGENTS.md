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
  - 支持 `Full`、`Fast`、`Hybrid` 捕获模式。
  - 严格保持消息序列完整性，杜绝序号跳跃与角色异常。
- **内容脚本模块**：`content.js` 由 `npm run build:extension` 从 `src/content/index.js` 生成，`// @convo-vault-include <name>` 按 `scripts/lib/content-build.mjs` 的 `INCLUDE_FILES` 原位展开，所有模块共享同一个作用域。`index.js` 负责常量、采集编排和通用工具；`selector-panel.js` 选择面板；`message-discovery.js` 消息节点、角色、正文与时间识别；`agent-trace.js` 回答过程的有序事件记录（PDF 思考时间线和 agent-trace 文件的唯一来源）；`thinking-flyouts.js` 页面上展开的思考面板（Full 模式）；`dom-serializer.js` DOM 转 Markdown；`bundle-export.js` 导出与图片下载；`auto-export.js` 自动导出任务（URL 哈希 `#convo-vault-job=<id>` 触发，认领、扫描、过完整性闸门、导出并回报，不经面板）；`capture-fast.js`/`capture-full.js` 两种采集；`chatgpt-markup.js`/`chatgpt-dom.js` ChatGPT 格式适配；`conversation-manifest.js` 完整性清单。
- **命令行与 Skill**：`scripts/convo-vault.mjs`（`export`/`setup`/`doctor`/`skill install`/`backend`）经本地渲染服务的 `/jobs` 接口让扩展自动导出；`skills/convo-vault/SKILL.md` 是 Claude/Codex 的 skill 模板（`{{CLI}}` 在安装时替换成命令行绝对路径）；`npm run package` 生成发布包，推送 `v*` 标签由 `.github/workflows/release.yml` 发布。
- **生成式界面 (DIL)**：Fast 把 `metadata.model_dil_v2` 打包为消息的 `dil` 字段，`tools/advanced-pdf/dil-runtime.js` 在 PDF 页面里执行并绘制；页面 CSP 禁止一切网络请求，失败时显示 Markdown fallback。
- **每次交付都升版本号**：任何交给用户安装或测试的代码改动，都至少提升补丁版本（如 0.9.1 → 0.9.2），并同步 `package.json`、`manifest.json`、`tools/advanced-pdf/package.json`、`src/content/index.js` 的 `EXPORTER_VERSION`、`popup.html`、`tests/version.test.mjs`、`README.md` 与 `README.zh-CN.md` 的“当前版本”和更新说明（`README.md` 是英文默认版），以及 `CHANGELOG.md`、`CHANGELOG.zh-CN.md`，让用户能从面板和扩展页面看出装的是哪一版。

---

## 3. 常用开发与验证命令

在 Windows PowerShell 环境下运行：
- **测试套件**：`npm test`
- **代码与 JSON 校验**：`npm run check`
- **Fixture 完整测试**：`npm run test:fixtures`
- **构建扩展**：`npm run build:extension`
