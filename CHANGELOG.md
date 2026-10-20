# Changelog

[简体中文](CHANGELOG.zh-CN.md)

Releases before 0.10 are documented in Chinese in [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md).

## 0.10.3

Docs and project basics:

- **English is now the default language**: `README.md`, `CHANGELOG.md` and `INSTALL.md` are English; Chinese versions live in `README.zh-CN.md`, `CHANGELOG.zh-CN.md` and `INSTALL.zh-CN.md`.
- **Comparison with similar projects** and a sample of the PDF output in the README.
- **Repository basics**: MIT license, `SECURITY.md`, `CONTRIBUTING.md`, issue and pull request templates, and fuller `package.json` metadata (repository, keywords, license). `tests/version.test.mjs` now also checks the versions in the READMEs and changelogs.

## 0.10.2

Less fuss:

- **The renderer exits by itself.** The local renderer started by the CLI, an agent or the MCP server exits two minutes after its last request (never while a request is running). The one started with **Copy Start** in the popup stays up.
- **Data-only export.** `--no-pdf` (MCP tool argument `pdf: false`) skips the PDF, so the zip holds only Markdown, JSON, JSONL and assets and needs no headless Chrome.
- **Fix:** `--no-extract` and `setup --no-open` had no effect. All `--no-xxx` options are now recognised.

## 0.10.1

Docs and CI:

- **README redesign** with a banner, an agent demo illustration, a three-step install and a table of supported environments. Panel screenshots moved into a collapsed section.
- **CI:** fixed the CLI end-to-end test failing on Windows. Tests now set the config folder with `CONVO_VAULT_HOME` instead of overriding the home directory variables.
- **Repository housekeeping:** removed merged branches and turned on automatic branch deletion after merge.

## 0.10.0

Agents can export directly:

- **Agent skill.** A `convo-vault` skill for Claude and Codex. Paste a link or send a screenshot of a conversation and the agent reads the link, runs the CLI, exports, and tells you where the folder is. No selector, no Fast / Hybrid / Full choice, no Start Scan or Export.
- **CLI.** `convo-vault export <link|id>` runs an export end to end (Fast by default, unpacked into `~/Downloads/convo-vault/`). Also `setup`, `doctor`, `verify`, `update`, `skill install` and `backend start|stop|status`.
- **Export jobs.** The CLI creates a job on the local renderer and opens the conversation with `#convo-vault-job=<id>`. The extension claims the job, captures, passes the integrity gate, renders, hands the zip back and closes the tab. Only local programs can create jobs and only the extension can claim them. The integrity gate still applies: an incomplete capture fails the job with a reason.
- **Install from a link.** `INSTALL.md` is written for agents: give one the repository link and ask it to install, and it clones, installs dependencies, builds the extension, installs the skill and verifies. `verify` pings the extension through a job.
- **MCP server.** `scripts/mcp-server.mjs` (no dependencies, stdio) provides `export_conversation`, `export_status` and `check_setup`. `mcp install` adds it to Claude desktop; `mcp config` prints settings for Claude Code, Codex and others.
- **Release package.** `npm run package` builds `dist/convo-vault-<version>.zip` (extension, CLI, renderer, skill). Pushing a `v*` tag publishes it through GitHub Actions.

## 0.9.5

Full thinking and tool process:

- Fast export records every step ChatGPT stored between a prompt and its answer, in order: thinking summaries, the model's notes, tool calls (web search, apps such as GitHub, code execution) with their returned content, and the closing summary. Each step has a timestamp and a relative time.
- Full tool output lives in `*.agent-trace.json`. `*.agent-trace.md` is the readable version with long outputs truncated and pointed to the JSON.
- A source index lists every web page seen while thinking, per answer and for the whole conversation, and whether the answer cited it.
- The PDF thinking section follows the same order as ChatGPT's thinking panel.
- Data ChatGPT does not store (search queries, some tool arguments) is marked `inputHidden` rather than invented.

## 0.9.4

PDF pagination and thinking:

- Page breaks are decided from Chrome's own layout instead of estimated heights. On one long conversation the PDF dropped from 180 to 157 pages and pages less than 60% full from 31 to 2.
- Raw tool output (for example a full GitHub API response) no longer leaks into the thinking section.
- File links in generative UI show the link text ChatGPT gave instead of the file name.

## 0.9.3

Generative UI drawn like the web page:

- ChatGPT's generative answers (cards, flow diagrams, workbench UI, phase lists, score bars, file cards) are drawn locally in the PDF. The bundle stores ChatGPT's own UI program and an offline renderer runs it. If a UI cannot be drawn, the text version is used.
- Markdown and data files are unchanged; the UI program is kept only in the payload JSON.
- `src/content/index.js` was split into modules; the generated `content.js` is byte-identical to before.

## 0.9.2

Lists and score bars in generative UI: content generated by `{#each}` loops is now expanded from the component source when the data is a literal, instead of being dropped from ChatGPT's `fallbackMarkdown`. Only literals are parsed; no code is executed.

## 0.9.1

Images, PDF layout and very long conversations:

- Fast is the default and recommended mode.
- Images uploaded to ChatGPT are downloaded by the page with the signed-in session and packed into the zip; failures are reported on the panel.
- PDF layout close to the ChatGPT page: single column, prompts as right-aligned bubbles, uncropped screenshots, clickable merged footnotes.
- A conversation of about 2,700 nodes loads in one request in about 10 seconds; pagination is the fallback.

## 0.9.0

Aligned with ChatGPT's October 2026 page and response formats:

- The integrity check is based on the API: all three modes build the expected message list from the conversation API and check the export against it by message id.
- Adjacent same-role messages are explained (`client_stopped`, or no reply stored).
- Full and Hybrid understand the new message units; Hybrid merges Fast and Full by message id.
- Generative UI answers export ChatGPT's `fallbackMarkdown`; inline `cite`, `entity` and `url` markup is resolved; writing blocks become copyable code blocks.
