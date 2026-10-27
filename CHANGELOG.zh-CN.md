# 更新日志

[English](CHANGELOG.md)

## 0.12.0

批量导出不再每个对话弹一个窗口；也不用再逐个给链接，可以直接说“Working 项目里的全部对话”。

- **多个对话只开一个标签页**：`export <链接> <链接> ...` 给每个对话建一个任务，但只打开一个 ChatGPT 标签页。每个任务自己写明要哪个对话，所以标签页不会跳转，依次导出，最后关掉。每个对话的结果分别打印，某个失败不影响其余的，有失败时退出码为 1。标签页停止处理（被手动关掉、掉登录）时，剩下的任务大约 50 秒后就判失败，不再每个等 15 分钟。macOS 上标签页在后台打开，不把浏览器带到前台（`open -g`）；Windows 和 Linux 上浏览器仍可能弹到前面，但一批只弹一次
- **`list`**：`list [--project 名称|ID|链接] [--limit N] [--json]` 打印账号最近的对话或某个项目的对话（id、日期、标题）。ChatGPT 的列表接口没有公开文档，所以按形状识别（带 UUID 的 id 加标题的对象），页面上的链接作为后备；用了后备时会在输出里说明
- **`export --project 名称`**：先列出项目，再把项目里的每个对话（加上额外给的链接）在一个标签页里导出
- **`--files-for "A,B"`**：只给标题含 A 或 B（或 id 等于它们）的对话下载上传和生成的文件；`--files` 仍表示全部
- **对话标题改用 ChatGPT 接口返回的标题**：在后台标签页里发起的导出，标签页标题可能还是占位的“新聊天”。现在优先用接口标题，忽略占位名，批量导出也不会把当前标签页的标题借给别的对话
- **两个 skill 都知道了**：Agent 会先 `list` 项目而不是向你要链接，多个链接传给同一个命令，只有部分对话要附件时用 `--files-for`
- 内部：任务支持 `conversationId` 和 `list` 请求，渲染服务新增 `/jobs/:id/result` 给返回数据的任务用，内容脚本可以从 `#convo-vault-job=a,b,c` 认领多个任务

写这个版本时没有用真实 ChatGPT 账号验证的：列表接口（`/backend-api/gizmos/snorlax/sidebar`、`/backend-api/gizmos/<项目>/conversations`、`/backend-api/conversations`）以及对话接口是否带 `title`。测试用的是模拟的返回。

## 0.11.10

更新之后不该让任何人去扩展页面点刷新。

- **`export` 会自己重新加载过期的扩展**：项目更新后（`update`、`git pull`、skill），浏览器里跑的还是旧扩展，直到它被重新加载。现在导出前，命令行会先问扩展它是哪个版本；和项目版本不同时，必要时先重新构建 `dist/`，让扩展自己重新加载，确认新版本后再导出。每个项目版本只检查一次，而且只对以前应答过的浏览器检查（记住的那个或 `--browser`），所以第一次导出和之后每次导出都不多花时间。只有已安装的扩展太旧、不认识重新加载任务（0.11.1 之前）时，才需要手动刷新一次
- **Agensi 的 skill 现在会说明怎么更新**：新增“Updating later”一步，运行 `update --no-skill`，自动拉取、重新构建并重新加载扩展，不需要点任何东西

## 0.11.9

拿一份真实导出（一个 70 条消息、带上传 PDF 的对话）和 ChatGPT 页面对照，发现两处泄漏。消息、顺序、首尾和思考记录都对得上，下面两处不对：

- **文档页面预览图不再混进回答**：ChatGPT 读取上传的 PDF 时，读取工具会给模型每页一张图（`sediment://<id>#file_<id>#p_<n>.<哈希>.jpg`）。过滤只认旧的工具名（`file_search`、`myfiles_browser`），现在的 ChatGPT 叫它 `api_tool`，于是 50 张页面预览图以失效图片链接的形式漏进两条回答，还把图片数和“降级对象”数撑大。现在直接按图片指针本身识别，抓取和完整性清单两处都改了，不再依赖工具名。真正生成或上传的图片不受影响
- **`<FileCite ... />` 标签不再以原文漏出**：现在的 ChatGPT 用行内标签引用上传的文档，不再是旧的 `fileciteturn0file0`。有引用记录时变成和以前一样的脚注，没有时直接去掉

## 0.11.8

弹窗不再默认推手动导出，由用户自己决定。

- **弹窗新增“手动控制”开关，默认关闭**：关闭时弹窗只是个连接器，说明导出由 Agent 发起，没有要点的东西；打开后和以前一样（Export this conversation、后端文件夹、Check、Copy Start、Stop）。选择保存在 `convoVaultSettings.manualControls`，渲染服务发给扩展的本地令牌两种情况下都保留。Agent、命令行和 MCP 发起的导出不受开关影响。以前用弹窗按钮的用户需要打开一次开关
- **上架 Agensi**：skill 的纯文字版已免费上架 [Agensi](https://www.agensi.io/skills/convo-vault-chatgpt-exporter)，源文件是 `skills/convo-vault-agensi`；安装本项目前会先征求用户同意。

## 0.11.7

可选的文件下载。导出的重点是对话和模型的思考，所以文件默认不下，用户要了才下：

- **`--files` 下载对话里的文件**：用户上传的文件，和 ChatGPT 生成的文件（`sandbox:/mnt/data/...` 链接），用浏览器里已登录的 ChatGPT 会话下载到 `assets/files/<哈希>-<文件名>`。每个文件在 `*.assets.manifest.json` 里记录大小、SHA-256、类型和来源。MCP 参数：`files: true`
- **默认关闭，skill 会问一次**：skill 现在会先问“要不要把上传和生成的文件也下载？默认不下”。只有明确说要才加 `--files`；没回答、回答含糊或答非所问都按不下载处理。不加 `--files` 时，manifest 仍把每个文件列为 `not-requested`，不会悄悄丢掉。图片不变，始终保存
- **单个文件失败不会让导出失败**：下不下来的文件（ChatGPT 已清掉沙箱、对话已删除、超过 64 MB、一次导出的文件总量超过 120 MB、网络错误）会各自记录原因（`download.state: "failed"`、`download.reason`），其余照常。manifest 的 `fileDownload` 给出 `requested`、`total`、`stored`、`failed`
- **结构化的文件引用**：每条消息现在带 `fileRefs`（类型、文件 id 或沙箱路径、名称、类型、大小），即使不下载文件也会记录

在一个真实的 564 条消息对话上测试时确认：上传文件走 `/backend-api/files/download/<id>`，生成的文件走 `/backend-api/conversation/<id>/interpreter/download`，对话或沙箱不在之后两者都不能下载。

## 0.11.6

一个不熟悉项目、被限制在工作目录内的 Agent 从 GitHub 链接安装时遇到三处不顺：

- **`setup` 不再因为 skill 装不上而中断**：写 `~/.claude/skills`、`~/.codex/skills` 可能被拒绝（沙箱里的 Agent、只读的家目录）。现在 setup 打印警告后继续，配置照常写入，也会显示“加载扩展”的步骤。`setup --no-skill` 可以主动跳过 skill
- **`verify` 会显示应答的扩展是哪个版本**：扩展在 ping 的回复里带上版本号，`verify` 输出 `Extension X answered in <浏览器>`；X 与本项目版本不同时提示用 `reload`。旧版扩展不带版本号，会如实说明
- **INSTALL.md 说明如何把一切放在同一个文件夹**：`CONVO_VAULT_HOME`（配置）、`--out`（导出）和 `setup --no-skill`

## 0.11.5

- **skill 改名为 `convo-vault-skill`**：和项目同名时，Agent 分不清“convo-vault”指项目还是 skill。文件夹是 `skills/convo-vault-skill`，`skill install` 会清掉旧的 `convo-vault` 文件夹（仅当它是这个 skill 的）

## 0.11.4

- **自成一体的 skill**：`skills/convo-vault` 现在包含 `SKILL.md`、`scripts/run.mjs` 和 `agents/openai.yaml`。启动脚本会自己找到 Convo Vault 项目（环境变量 `CONVO_VAULT_DIR`、`setup` 记下的路径或常用位置），第一次用时自动从 GitHub 克隆，所以放在哪里都能用。`skill install --dir <文件夹>` 可以把它装到任意文件夹

## 0.11.3

- **修复：Markdown 里的布局标签**：ChatGPT 生成式界面的源码里有些属性不带引号（`align=start`、`gap=1`），解析器遇到就放弃，导致 `<row>`、`<box>`、`<checkbox>` 漏进 Markdown。现在能读不带引号的值，复选框变成 `- [ ]` / `- [x]`，ChatGPT 自带 fallback 文本也做同样清理；PDF 一直是对的。第一次真实导出发现，第二次确认

## 0.11.2

只靠 API 就能得到完整的思考记录：

- **不再读页面**：打开并读取页面思考面板的代码，以及页面扫描诊断，都已删除。在 4 个真实对话上（共 28 条消息，单个回答最多 42 个来源），带和不带页面面板导出，思考、工具调用、来源和回答都完全相同，所以 API 记录就是完整来源。内容脚本缩小到原来的三分之一左右
- **完整性检查只用 ChatGPT 的消息清单**：拿不到清单时导出会停下并说明原因，不再退回页面计数
- 不再下载调试日志，保真警告只保留在内存里

## 0.11.1

更简单的抓取，扩展能自己重新加载：

- **只用 Fast 抓取**：删除 Full、Hybrid 模式、页面滚动扫描和消息选择面板。对话直接读 ChatGPT 接口，不滚动、不点击，导出整段对话；弹窗只有一个 **Export this conversation** 按钮；CLI 和 MCP 去掉 `--mode`。约 4,600 行死代码被清理
- **扩展自重载**：`convo-vault reload`（以及 `update`）能让重建后的扩展自己重新加载
- **Lint**：`npm run lint`（CI 里也跑）检查“用到但已不存在的名字”，这是共享作用域的内容脚本在重构时容易犯的错
- **构建修复**：构建改为原地更新 `dist/convo-vault-extension`，不再先删文件夹；文件夹被删会让 Chrome 把扩展禁用
- **修复**：清理死代码时漏掉仍被引用的两个辅助函数，已补回（第一次真实导出时发现）

## 0.11.0

由 Agent 来跑导出。从这个版本起不用再点面板：对 Claude 或 Codex 说“把这个对话导出来”，或者发一张截图，剩下的它来做。

- **Agent skill、命令行和 MCP 服务**：Claude 和 Codex 的 `convo-vault` skill，`convo-vault export <链接|id>`，以及给聊天类应用用的 MCP 服务（`export_conversation`、`export_status`、`check_setup`）。命令行另有 `setup`、`verify`、`doctor`、`update`、`skill install`、`mcp install`、`backend`
- **自动导出任务**：命令行在本地渲染服务里创建任务，并用带任务 id 的网址打开对话；扩展认领任务后自动抓取、过完整性闸门、渲染、交回 zip 并关闭标签页。任务只能由本机程序创建、只能由扩展认领；抓取不完整时任务失败并说明原因
- **一句话安装**：`INSTALL.md` 是写给 Agent 的安装步骤，把仓库链接发给 Agent 说“帮我安装”即可
- **渲染服务自动退出**：最后一次使用两分钟后自己退出（处理请求时不会退出）；扩展弹窗的 Copy Start 启动的服务保持常驻
- **只导出数据**：`--no-pdf`（MCP 参数 `pdf: false`）跳过 PDF，不依赖无头 Chrome
- **修复**：`--no-extract` 和 `setup --no-open` 之前不生效
- **代码整理**：`extension/`（浏览器加载的全部源码）、`renderer/`（本地服务，原 `tools/advanced-pdf`）、`cli/`（命令行和 MCP 服务）、`scripts/`（仓库工具）。4,600 行的 `render.js`、1,300 行的 `server.js` 和 2,400 行的内容脚本 `index.js` 都按职责拆成模块，样式表移到 `renderer/static/render.css`；生成的内容脚本和所有测试样本渲染出的 HTML 与拆分前逐字节相同。`content.js` 不再提交。删除了无人引用的 `templates/`、`schemas/`、`configs/` 和 PowerShell 脚本
- **项目规范**：英文成为 README、CHANGELOG、INSTALL 的默认语言（中文版为 `*.zh-CN.md`）；新增 MIT 许可证、`SECURITY.md`、`CONTRIBUTING.md`、Issue 和 PR 模板、更完整的 `package.json` 元数据、PDF 效果样张，以及 `npm run package` 生成的发布包

## 0.10.1

文档与 CI：

- **README 重写**：新增横幅和“对 Agent 说话”的演示图，安装步骤改为三步，补上各环境能否使用的对照表，面板截图收进折叠区
- **CI**：修复 Windows 上 CLI 端到端测试失败；测试改用 `CONVO_VAULT_HOME` 指定配置目录，不再改写用户主目录环境变量
- **仓库整理**：删除已合并的旧分支，合并后自动删除分支

## 0.10.0

让 Agent 直接导出，不用再点面板：

- **Agent Skill**：新增 `convo-vault` skill，可装进 Claude 和 Codex。对 Agent 说“把这个对话导出来”并给出链接，或直接发对话截图，它会自己读出链接、调用命令行、打开页面、导出并把文件夹位置告诉你；不再需要选 Fast / Hybrid / Full、点 Start Scan 或 Export
- **命令行 `convo-vault`**：`export <链接|对话 id>` 一条命令完成导出，默认 Fast，结果解压到 `~/Downloads/convo-vault/`。另有 `setup`（装依赖、构建扩展、安装 skill）、`doctor`（自检）、`skill install`、`backend start|stop|status`
- **自动导出任务**：命令行在本地渲染服务里创建任务，用 `#convo-vault-job=<id>` 打开对话页；扩展认领任务后自动扫描、过完整性闸门、渲染并交回 zip，然后关闭标签页。任务只能由本机程序创建、只能由扩展认领，网页脚本调不了。完整性闸门照常生效：抓取不完整时任务失败并说明原因，不会静默导出残缺内容
- **一键发布包**：`npm run package` 生成 `dist/convo-vault-<版本>.zip`（扩展、命令行、渲染服务、skill 一起），推送 `v*` 标签时 GitHub Actions 自动发布到 Releases
- **一句话安装**：新增 `INSTALL.md`（写给 Agent 的安装步骤）。把仓库链接发给 Claude Code 或 Codex，说“帮我安装”，它会克隆、装依赖、构建扩展、装 skill 并验证；`verify` 用一个 ping 任务确认浏览器里的扩展有响应，`update` 拉取新版本并重新安装
- **MCP 服务**：新增 `scripts/mcp-server.mjs`（无依赖，stdio），提供 `export_conversation`、`export_status`、`check_setup`；`mcp install` 写入 Claude 桌面版配置，`mcp config` 打印 Claude Code、Codex 等客户端的配置。Claude 桌面版的普通聊天因此也能用链接或截图导出
- **文档**：README 重写；历史更新说明移到本文件

## 0.9.5

完整记录思考过程：

- **按时间顺序记录每一步**：Fast 导出时，把每个回答从提问到作答之间 ChatGPT 保存的所有步骤按原顺序记下来：思考摘要、模型写给你的说明、工具调用（网页搜索、GitHub 等应用、代码执行）及其返回内容、思考总结。每步带时间戳和相对秒数，并发调用的结果按调用顺序配对
- **完整内容只放在 `*.agent-trace.json`**：工具返回的原文（打开的网页、应用数据、代码输出）不再截断成 300–500 字；`*.agent-trace.md` 是可读版，长输出截断并指明 JSON 位置。`data.json` 和 `messages.jsonl` 里只留统计数，不再重复三份
- **来源索引**：每个回答和整段对话都列出思考时看过的全部网页，标明出现在哪几轮、回答是否引用
- **PDF 里的思考过程改为时间顺序**，和 ChatGPT 的思考面板一致；每次搜索列出全部新来源（同一回答里已列过的不重复），应用调用显示调用了什么和参数
- **ChatGPT 本身不保存的内容如实标注**：网页搜索的检索词和 `functions.*` 调用的参数在 ChatGPT 的数据里是空的，记录里标为 `inputHidden`，不会编造

## 0.9.4

PDF 分页与思考过程：

- **分页按 Chrome 实际排版计算**：以前按高度估算分页，遇到不能拆开的卡片、引用块会越估越偏，出现回答标题单独留在页底、半页空白等问题。现在先把对话按一页高的分栏排一遍，读出每个元素真实落在哪一页，再决定在哪里另起一页；超过 40% 页高的“不拆分”块允许跨页。实测《整理聊天记录》从 180 页减到 157 页，低于六成满的页面从 31 页降到 2 页
- **思考过程不再混入工具原始输出**：联网工具打开网页后返回的原始内容（例如整段 GitHub API JSON）和模型的分析说明走同一个通道，以前被误当成“分析计划”写进思考过程。现在只保留模型自己的说明，与 ChatGPT 页面显示一致
- **生成式界面里的文件链接**显示 ChatGPT 给的链接文字（如“下载人工验收评分表 v0.4”），不再显示文件名

## 0.9.3

生成式界面按网页样式绘制：

- **生成式界面在本地画出来**：ChatGPT 的生成式回答（卡片、流程图、工作台界面、P0–P4 阶段列表、评分条、文件下载卡片、写作块）以前只能导出文字版。现在导出包保存 ChatGPT 自己的界面程序，本地渲染器在离线的 PDF 页面里执行它，画出接近网页的静态界面；按钮和选择不可交互，图片搜索结果显示为带标题的占位框。某个界面画不出来时，自动改用原来的文字版
- **Markdown 不变**：`.md` 和数据文件仍是文字版，界面程序只保存在 payload JSON 里，供以后重新渲染
- **代码整理**：内容脚本 `src/content/index.js` 从 7200 行拆成按职责划分的模块（选择面板、消息识别、思考过程、DOM 转 Markdown、导出），生成的 `content.js` 与拆分前逐字节相同

## 0.9.2

生成式界面里的列表与评分图：

- **循环内容不再丢失**：ChatGPT 自带的 `fallbackMarkdown` 会整段省略 `{#each}` 循环生成的内容（例如阶段列表、评分条）。当循环数据是写在回答里的字面量时，导出改为从组件源码展开，每行合并为一行（如“意图理解 · 25%”）；只解析字面量，不执行任何代码。数据来自外部变量时保留 fallback，并在 debug log 计数
- **图片搜索占位**统一显示为 `*[Image search: …]*`

## 0.9.1

图片打包、PDF 阅读版式与超长对话：

- **Fast 成为默认推荐模式**：面板默认选中 `Fast (Recommended)`，未指定模式的导出也走 Fast
- **图片打包**：ChatGPT 上传的截图改由页面用当前登录状态下载后打包进 zip，失败时在面板上说明原因；读取上传文档时生成的逐页图片（只给模型看，ChatGPT 页面不显示）不再混入回答
- **PDF 阅读版式**：接近 ChatGPT 页面的单栏排版，提问为右侧气泡、截图完整不裁切，回答通栏显示；头像与编号、时间放在每条消息的小字行；目录只列提问；脚注可点击并合并相同来源；中文标点旁的粗体正常显示
- **超长对话加载**：Fast 先一次取回完整对话树（约 2700 个节点的对话约 10 秒），分页接口作为后备；单次请求超时放宽到 45 秒，翻页时面板显示页数和已载入消息数
- **重复来源**：回答多次引用同一份上传文档时，脚注只列一次

## 0.9.0

适配 ChatGPT 2026 年 10 月的页面与回复格式：

- **完整性检查以接口为准**：三种模式都从 ChatGPT conversation API 的原始节点生成"应有消息清单"，按 ChatGPT 消息 id 逐条核对导出结果；不再依赖页面上已经消失的 `conversation-turn-N` 编号，也不再拿导出结果和它自己比较
- **同角色相邻有原因**：用户连续两条消息之间没有回复时，报告会说明是"回复在产生内容前被停止"（`client_stopped`）还是"ChatGPT 没有存储任何回复"
- **新页面结构（消息单元）**：Full 和 Hybrid 识别 `data-chatgpt-search-unit-key` 消息单元，从单元读取角色和消息 id；虚拟滚动下按消息 id 保持顺序；Hybrid 按消息 id 合并 Fast 与 Full 的同一条消息
- **生成式界面回复（DIL）**：带卡片、流程框、按钮、单选组的新式回复，导出 ChatGPT 自带的 `fallbackMarkdown`，不再把 `<box>`、`<row>`、`{@body ...}` 等组件源码写进 Markdown
- **内联标记**：`cite` 引用解析成带链接的脚注（同时支持新的 `search_result_groups` 和旧的 `grouped_webpages`），`entity` 输出实体名，`url` 输出 Markdown 链接，写作块（`:::writing`）输出为可复制的 ```` ```writing ```` 代码块
- **Debug log 页面信息**：页面地址和标题在开始抓取时记录，导出期间切换对话不再写错

## 0.8.5

深度强化思考链（Thinking Trace）与文献引用可点击性：

- **高保真深度思考捕获**：支持长达数分钟的复杂多步思考链（Multi-Step Chain-of-Thought）全量提取，耗时与推理标题规范化折叠
- **点击直达的文献引用**：搜索引用与云端文档切片全面转换为标准 Markdown 格式，引用角标点击直达目标源
- **架构解耦与纯净知识包**：彻底解除对下游特定笔记软件（如 Obsidian）的强制绑定，回归通用 Agent 知识资产原语

## 0.8.3

强化图像素材完整性与离线账本：

- **图像素材完整归档**：多模态对话中的关键图片本地 SHA-256 缓存归档，远端引用与占位卡片标准化
- **Assets Manifest 账本**：详细记录全部 100+ 媒体资产的来源、存储策略、降级原因与引用位置

## 0.8.2

迁移 ChatGPT 复数分页接口（Plural API Pagination）：

- **Fast API 分页自动穿越**：全面适配 `/backend-api/conversations/{id}` 最新长对话分页流，自动向前分页至对话起点
- **会话 Token 凭证自愈**：当 `/api/auth/session` 受限时，自动无缝提取网页端 Bootstrap Session，无需用户重新登录

## 0.8.1

推出 Agent 认知与工具调用执行链路 Sidecars（`*.agent-trace.json` & `*.agent-trace.md`）：

- **执行追踪隔离归档**：将 ChatGPT 内部的文档切片（`[L1]...`）、Python 沙盒代码与 Web 搜索操作单独提取为 Agent 报告，避免污染干净的 Markdown/PDF 答复正文
- **思考活动时间线**：计划 (`💬`)、工具 (`🔌`)、搜索 (`🔍`)、执行 (`⚙️`)、推理 (`🧠`) 结构化分类呈现

## 0.7.26

重磅推出 Fast 2.0 轮次聚合引擎（Turn-Chain Synthesizer）与全维度元数据提取：

- **Turn-Chain 轮次链路聚合**：彻底解决多步工具调用（DALL-E 绘图、代码沙盒、Drive 插件）导致的 11 条助手回复漏抓与图片丢失问题；保证每个用户提问严格对称对应一个高保真助手大卡片（100% 轮次召回）
- **DALL-E 与多模态图像资产全量保留**：自动提取 DALL-E 绘图节点生成的全部高清图片指针与沙盒工件，消灭 Same-Role Adjacency 断层
- **思考链与精准耗时（Thinking Process & Duration）**：自动提取思考摘要、推理标题与真实思考秒数（如 `Worked for 11s`、`Worked for 9m 38s`），格式化为折叠思考块
- **文献引用与标准角标（Sources & Citations Footnotes）**：自动解析 Google Docs / 网页调研引用，将内部标记替换为标准 Markdown 文献脚注 `[^1]: [标题](URL)`
- **长期记忆与历史对话（Memory & Context）**：自动提取记忆引用与前置历史对话关联卡片
