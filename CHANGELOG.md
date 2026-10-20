# Changelog

[简体中文](CHANGELOG.zh-CN.md)

Releases before 0.10 are documented in Chinese in [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md).

## 0.11.4

- **Self-contained skill.** `skills/convo-vault` now holds `SKILL.md`, `scripts/run.mjs` and `agents/openai.yaml`. The launcher finds the Convo Vault project (`CONVO_VAULT_DIR`, the path `setup` records, or the usual folders) and clones it from GitHub the first time, so the folder works wherever it is saved. `skill install --dir <folder>` copies it to any folder.

## 0.11.3

- **Fix: layout tags in Markdown.** ChatGPT's generative-UI source writes some attributes without quotes (`align=start`, `gap=1`), and the parser gave up on those tags, so `<row>`, `<box>` and `<checkbox>` showed up in the Markdown. Bare values are now read, checkboxes become `- [ ]` / `- [x]`, and the same clean-up applies to ChatGPT's own fallback text. The PDF was never affected. Found on the first real export and confirmed on the second.

## 0.11.2

The thinking record is complete from the API alone:

- **No more page reading.** The code that opened and read thinking panels on the page, and the page-scan diagnostics, are removed. On four real conversations (28 messages, up to 42 sources in one answer) exporting with and without the page panels gave identical thinking, tool calls, sources and answers, so the API trace is the complete source. The content script is now about a third of its former size.
- **Integrity check uses ChatGPT's message list only.** If ChatGPT does not return it, the export stops with a clear message instead of falling back to a page census.
- Debug logs are no longer downloaded; fidelity warnings stay in memory.

## 0.11.1

Simpler capture, and the extension reloads itself:

- **Fast capture only.** Full and Hybrid modes, page scanning and the message selector are gone: the conversation is read from ChatGPT's API, nothing is scrolled or clicked, and the whole conversation is exported. The popup has a single **Export this conversation** button. `--mode` is removed from the CLI and MCP tool. About 4,600 lines of dead code were removed.
- **Extension self-reload.** `convo-vault reload` (and `update`) make a rebuilt extension reload itself.
- **Lint.** `npm run lint` (run in CI) flags names that are used but no longer defined, a mistake a refactor can easily make in the shared-scope content script.
- **Build fix.** The build updates `dist/convo-vault-extension` in place instead of deleting it first. A deleted folder made Chrome disable the extension.
- **Fix:** two helper functions that the dead-code removal left referenced were restored (found by the first real export).

## 0.11.0

Agents run the export. From this version you do not click the panel: tell Claude or Codex to export a conversation, or send it a screenshot, and it does the rest.

- **Agent skill, CLI and MCP server.** A `convo-vault` skill for Claude and Codex, `convo-vault export <link|id>`, and an MCP server (`export_conversation`, `export_status`, `check_setup`) for chat apps. `setup`, `verify`, `doctor`, `update`, `skill install`, `mcp install` and `backend` complete the CLI.
- **Export jobs.** The CLI creates a job on the local renderer and opens the conversation with the job id in the URL. The extension claims the job, captures, passes the integrity gate, renders, hands the zip back and closes the tab. Only local programs can create jobs and only the extension can claim them. An incomplete capture fails the job with a reason.
- **Install from a link.** `INSTALL.md` is written for agents: give one the repository link and ask it to install.
- **The renderer exits by itself** two minutes after its last request (never while a request is running). The one started with **Copy Start** in the popup stays up.
- **Data-only export.** `--no-pdf` (MCP argument `pdf: false`) skips the PDF, so no headless Chrome is needed.
- **Fix:** `--no-extract` and `setup --no-open` had no effect.
- **Code layout.** `extension/` (everything the browser loads), `renderer/` (the local service, formerly `tools/advanced-pdf`), `cli/` (CLI and MCP server) and `scripts/` (repository tooling). The 4,600-line `render.js` and the 1,300-line `server.js` are split into modules, the 2,400-line content `index.js` into fragments, and the stylesheet moved to `renderer/static/render.css`. The generated content script and the rendered HTML of every test fixture are byte-identical to before. `content.js` is no longer committed. Unused `templates/`, `schemas/`, `configs/` and PowerShell scripts were removed.
- **Project basics.** English is the default for README, CHANGELOG and INSTALL (Chinese versions are `*.zh-CN.md`); MIT license, `SECURITY.md`, `CONTRIBUTING.md`, issue and PR templates, fuller `package.json` metadata, a PDF output sample, and a release package built by `npm run package`.

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
