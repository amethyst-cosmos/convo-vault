# Changelog

[简体中文](CHANGELOG.zh-CN.md)

Releases before 0.10 are documented in Chinese in [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md).

## 0.15.2

- Docs only. The Agensi listing is now "Convo Vault Chat Exporter" and its address is `agensi.io/skills/convo-vault-chat-exporter`; README links point there.
- The listing's tags, use cases, FAQ and creator bio, and the GitHub description and topics, now name ChatGPT, Grok and Gemini instead of ChatGPT only.

## 0.15.1

Wording only: Convo Vault is described as a chat exporter for ChatGPT, Grok and Gemini, not as a ChatGPT exporter. No behaviour changes.

- **README (English and Chinese)**: the intro, the banner text and the privacy section say "chat", a new "Supported chats" table lists each site with the link to give it, how it is read and what the export is checked against, and the places that said "ChatGPT" for everything (sign-in step, the "Where it works" table, the manual export, how it reads a conversation) name the three sites.
- **INSTALL, SECURITY, renderer README**: the install steps and the agent instructions say "chat conversation" with the three link shapes; the security scope covers the three sites and says whom to report their own bugs to (OpenAI, xAI, Google).
- **Skills and MCP**: the local skill's name line, description and trigger words, `agents/openai.yaml` and the MCP tool text name ChatGPT, Grok and Gemini. The Agensi skill text is a separate submission and is handled on its own.
- **Package and extension**: `package.json` description and keywords (`chat-exporter`, `grok`, `gemini`, `ai-chat`) and the extension's description on the Extensions page.
- **CLI messages**: the help, the "not a conversation link" errors, the sign-in hints in `setup` and `verify` and the MCP reminder say "chat site" instead of ChatGPT.
- **Images**: the banner (English and Chinese) and the social preview say "A chat exporter: ChatGPT, Grok and Gemini into a knowledge pack"; the social preview PNG is regenerated.

## 0.15.0

Images from Grok and Gemini are exported, not just linked. Found by checking one real image in each (a robot photo Grok generated, an interface mock-up Gemini generated) in the browser's developer tools.

- **Grok.** A generated image is a card (`cardAttachmentsJson`, type `render_generated_image`) that the answer text points at with a `<grok:render card_id=…>` tag; the picture's path is `image_chunk.imageUrl` on `assets.grok.com`. The tag becomes an image in the Markdown at the place it stood (once, even if the card is also in `generatedImageUrls`); a card the text did not point at is added after the answer. Images you uploaded (`fileAttachmentsMetadata` of an image type, `imageAttachments`) are shown in your prompt; other files are still listed by name.
- **Why the page downloads Grok's images.** `assets.grok.com` answers 200 to a request from grok.com and 403 to one without it as referrer, and a fetch from the extension's background has no such referrer, so the content script fetches them (with the page's session) and hands the bytes over like it does for ChatGPT's images. A refused answer can be kept by the browser's cache and served again, so the second try bypasses the cache; a second refusal is recorded as that image's failure and is not retried by the background.
- **Gemini.** A picture on the page is a `blob:` URL the page made. A script cannot `fetch` it (the page's CSP refuses) but can draw it: the image is drawn to a canvas while the page is open and kept as PNG (JPEG if it would be over about 2.6 MB). The Markdown points at a made-up address (`https://gemini.google.com/__convo_vault_image/<n>`) and the bytes go to the bundle under it. The picture's alt text is the whole prompt that made it, so only its first 80 characters are kept. A picture the page does not let a script read (a cross-origin image would taint the canvas) stays a link, and a warning counts them. Pictures in your own prompt are handled the same way.
- Tests: Grok image cards (position, once, extra cards, uploads), Gemini pictures (kept, link fallback with the warning, in a prompt, store emptied per capture), the page downloader (session and cache bypass, a refusal, a non-image answer, Gemini's drawn pictures, ChatGPT untouched), and the background staging a made-up address from the page's bytes while fetching nothing.
- Verified by hand in the browser: Grok's image fetched (200, 265 KB JPEG, 1168×784, decodes) with the page's referrer and refused (403) without it; Gemini's image drawn to a canvas (1024×559, PNG 872 KB) while `fetch(blob:)` was blocked. Not yet run through the extension itself; the first real export with an image is the real test.
- Still not exported: other attachments (Grok lists their names; Gemini where the page shows them), Gemini's thinking panel.

## 0.14.0

Gemini (gemini.google.com) conversations can be exported, with the same bundle as ChatGPT and Grok.

- **Read from the page.** Gemini has no conversation API the extension can call, so each turn (`.conversation-container`: a `<user-query>` and a `<model-response>`) is read from the page. Gemini loads older turns only when the page is scrolled up, so for Gemini alone the page is scrolled to the top until the turn count stops growing (a few stable rounds, at most 80). The scroll limit and a page that drops turns while loading are reported.
- **HTML back to Markdown.** A reply's HTML becomes Markdown: headings, emphasis, links, nested lists, blockquotes, tables, code with its language (and any backticks inside it), inline code, math (`data-math` as `$…$` / `$$…$$`), rules; images become links (not downloaded); buttons, icons and hidden screen-reader text are dropped. What Gemini draws is what is exported, including its own odd bold around CJK quotes. A prompt is rebuilt from its lines and numbered list (the hidden screen-reader copy of it is skipped) and attachment names are listed when the page shows them (the class names for those were not seen on a real attachment, so treat it as best effort).
- **A weaker check, stated as such.** Nothing tells how many messages a Gemini conversation has, so the gate blocks on what the page can show: no turns, a prompt without a reply, a reply still being written, or turns lost while loading. A warning on every export says the count is only what the page showed, and that the collapsed thinking panel and source chips are not exported.
- **Title, id and labels.** The title is the tab title once Gemini has set it (the placeholder "Google Gemini" is ignored); the id comes from `/app/<id>`, `/u/1/app/<id>` (second account) or `/gem/<gem>/<id>`. Renderer: "Gemini conversation", "Gemini" on every answer and in the outline, an avatar of its own; defaults and agent-trace notes follow.
- **Command line.** `export` takes `gemini.google.com/app/<id>` links (the account part of the path is kept). Because a page-based site cannot move one tab from conversation to conversation, each Gemini link opens its own tab, one after another, with a summary; ChatGPT, Grok and Gemini links given together are grouped by site. Other sites are refused with a message naming the three. The MCP tool's description says so too.
- **Extension.** The content script and host permission cover `https://gemini.google.com/*` (already within `<all_urls>`, so Chrome asks for nothing new); the background and the popup accept Gemini tabs.
- **Not for Gemini:** attachments and images are not downloaded, no thinking trace, no timestamps (Gemini shows none), `list`, `--project`, `--files`.
- Verified by hand against one real Gemini conversation (3 turns): the page structure, the prompt rebuilt from a pasted multi-line text with a numbered list, and the replies' lists, links, quotes and bold. Tests use a small HTML parser and a pretend page; the first real export through the extension is the real test, and whether Gemini keeps `#convo-vault-job=…` in the address long enough to be read is the main thing to confirm.

## 0.13.0

Grok conversations (grok.com) can be exported, with the same bundle as ChatGPT.

- **Capture from Grok's own API.** On grok.com the extension reads `conversations_v2` (title), `response-node` (the tree) and `load-responses` (the messages) with the browser's session, the way it reads ChatGPT's API. No token is read and the page is never scrolled. Grok's inline citations become numbered footnotes (one per distinct page), its search and open-page steps become the thinking trace with the time it worked, and its own widget tags are dropped. User attachments are listed by name; generated images are listed as links.
- **An integrity check against Grok's tree.** The export is blocked when a response in the tree did not come back, when Grok is still writing one, or when a response on the path is unfinished. A regenerated or edited branch exports the newest path and is reported as a warning ("N alternative response(s) skipped"), not as a gap.
- **Renderer labels follow the site.** The payload now carries `provider`. A Grok export says "Grok conversation" on the cover, "Grok" on every answer and in the PDF outline, and has an avatar of its own; defaults such as "Grok Conversation" and the agent-trace notes follow it. A payload without `provider` is ChatGPT, exactly as before.
- **Command line.** `export` takes grok.com links (the `?rid=` anchor is dropped). Several Grok links run in one grok.com tab; ChatGPT and Grok links given together get one tab per site. Other sites are refused with a message naming the supported ones. The MCP tool's description says so too. A bare id is still a ChatGPT id.
- **Extension.** The content script and the host permission cover `https://grok.com/*` (the extension already had `<all_urls>`, so Chrome asks for nothing new). The popup's manual export accepts a Grok tab.
- **Not yet for Grok:** downloading attachments and generated images, `list`, `--project`, and `--files` (ignored). Tests use simulated Grok answers; the endpoints were checked by hand against one real conversation, so the first real export through the extension is the real test.

The Agensi skill text is unchanged and still describes ChatGPT only.

## 0.12.1

Release tooling and a lighter download. Nothing changes for someone who already exports.

- **`npm run version:set -- X.Y.Z` writes the version everywhere.** It covers `package.json`, `renderer/package.json`, `package-lock.json`, `extension/manifest.json`, `EXPORTER_VERSION`, the popup, and the badge and "current version" line of both READMEs, and adds an empty entry to both changelogs. A release no longer means editing a dozen files by hand. `tests/version.test.mjs` no longer hard-codes a version, and fails while a changelog entry still holds the placeholder, so an unwritten entry cannot be released. The per-version list in `README.zh-CN.md` duplicated the changelog and is gone; the README links to it.
- **Developer-only files are not downloaded.** Tests, the docs images, CI files, `AGENTS.md`, `CONTRIBUTING.md` and the lint config stay in the repository but are skipped by the install commands (a sparse clone, with a plain clone as the fallback for an old git) and left out of GitHub's "Source code" archives (`export-ignore`). The release zip never contained them. This only affects a fresh install; an existing checkout keeps working and `update` still pulls.
- **Cleanups.** `package-lock.json` said 0.11.0; the skill launcher no longer looks in a personal folder; `AGENTS.md` and `.gitignore` lose references to files that only exist on one machine.

## 0.12.0

## 0.12.0

Batch export without a pop-up per conversation, and a way to say "the whole Research project" instead of handing over links.

- **Several conversations in one tab.** `export <link> <link> ...` creates one job per conversation but opens ONE ChatGPT tab for all of them. Each job names its conversation, so the tab never navigates; it exports them one after another, then closes. Results are printed per conversation, a failed one does not stop the rest, and the exit code is 1 if any failed. A tab that stops processing the batch (closed by hand, signed out) fails the remaining jobs after about 50 s instead of waiting 15 minutes each. On macOS the tab opens without bringing the browser to the front (`open -g`); on Windows and Linux the browser may still come forward, but only once per batch.
- **`list`.** `list [--project NAME|ID|URL] [--limit N] [--json]` prints the id, date and title of the account's recent conversations or one project's. ChatGPT's list endpoints are undocumented, so the answers are read by shape (an object with a UUID id and a title) and the links on the page are the fallback; the output says when it had to fall back.
- **`export --project NAME`.** Lists the project, then exports every conversation in it (plus any links given) in one tab.
- **`--files-for "A,B"`.** Downloads uploaded and generated files only for the conversations whose title contains A or B (or whose id is given); `--files` still means all.
- **The conversation title comes from ChatGPT's API.** An export started in a background tab could get the placeholder "New chat" from the tab title. The API title is preferred, placeholders are ignored, and a batch never borrows the tab's title for another conversation.
- **Both skills know it.** The agent is told to list a project instead of asking for links, to pass several links to one command, and to use `--files-for` when only some conversations need files.
- Under the hood: jobs take a `conversationId` and a `list` request, the renderer has a `/jobs/:id/result` route for jobs that return data, and the content script claims several job ids from `#convo-vault-job=a,b,c`.

Not verified against a real ChatGPT account when this was written: the list endpoints (`/backend-api/gizmos/snorlax/sidebar`, `/backend-api/gizmos/<project>/conversations`, `/backend-api/conversations`) and that the conversation API returns a `title`. Tests use simulated answers.

## 0.11.10

Nobody should have to click reload on the Extensions page after an update.

- **`export` reloads an out-of-date extension by itself.** Updating the project (`update`, a `git pull`, a skill) leaves the browser running the old extension until it is reloaded. Before exporting, the CLI now asks the extension for its version, and if it differs from the project's it rebuilds `dist/` when needed, asks the extension to reload itself, confirms the new version and then exports. It does this once per project version, and only for a browser that has answered before (the remembered one or `--browser`), so a first export and every later one cost nothing extra. A reload by hand is needed only when the installed extension is too old to know the reload job (before 0.11.1).
- **The Agensi skill now says how to update.** A new "Updating later" step runs `update --no-skill`, which pulls, rebuilds and reloads the extension without a click.

## 0.11.9

Two leaks found by checking a real export (a 70-message conversation with an uploaded PDF) against the ChatGPT page. Messages, order, first and last message and thinking all matched; these two did not.

- **Document page previews no longer end up in the answer.** When ChatGPT reads an uploaded PDF, its reader tool hands the model one image per page (`sediment://<id>#file_<id>#p_<n>.<hash>.jpg`). The filter only knew the old tool names (`file_search`, `myfiles_browser`); current ChatGPT calls the tool `api_tool`, so 50 page previews leaked into two answers as broken image links and inflated the image and "degraded object" counts. They are now recognised by the pointer itself, in the capture and in the completeness manifest, so the tool name no longer matters. Real generated and uploaded images are untouched.
- **`<FileCite ... />` tags no longer show up as raw text.** Current ChatGPT cites an uploaded document with an inline tag instead of the old `fileciteturn0file0` token. With a citation record it becomes the same footnote as before; without one it is removed.

## 0.11.8

The popup no longer pushes manual export; the user decides.

- **A "Manual controls" switch in the popup, off by default.** Off, the popup is a plain connector: it says that the agent starts exports and shows nothing to click. On, it shows what it always did (Export this conversation, the backend folder, Check, Copy Start, Stop). The choice is saved in `convoVaultSettings.manualControls`, and the local token the renderer hands out is kept either way. Exports started by an agent, the CLI or MCP are not affected by the switch. Existing users who used the popup button need to turn the switch on once.
- **Agensi listing.** A text-only version of the skill is listed for free on [Agensi](https://www.agensi.io/skills/convo-vault-chatgpt-exporter). Its source is `skills/convo-vault-agensi`; it asks the user before installing this project from GitHub.

## 0.11.7

Optional file download. The point of an export is the conversation and the model's thinking, so files stay off unless the user asks:

- **`--files` downloads the files in a conversation.** Files the user uploaded and files ChatGPT generated (`sandbox:/mnt/data/...` links) are fetched with the browser's own ChatGPT session into `assets/files/<hash>-<name>`. Each file is recorded in `*.assets.manifest.json` with size, SHA-256, type and origin. MCP: `files: true`.
- **Off by default, and the skill asks once.** The skill now asks "also download the uploaded and generated files? default no". Only a clear yes adds `--files`; no answer, a vague answer or an unrelated one means no. Without `--files` the manifest still lists every file as `not-requested`, so nothing disappears silently. Images are unchanged and always saved.
- **A file never fails the export.** A file that cannot be downloaded (ChatGPT already deleted the sandbox, a deleted conversation, over 64 MB, more than 120 MB of files in one export, a network error) is recorded with its own reason (`download.state: "failed"`, `download.reason`) and the rest carries on. `fileDownload` in the manifest gives `requested`, `total`, `stored`, `failed`.
- **Structured file references.** Every message now carries `fileRefs` (kind, file id or sandbox path, name, type, size), recorded even when files are not downloaded.

Found while testing on a real 564-message conversation: ChatGPT serves uploads from `/backend-api/files/download/<id>` and generated files from `/backend-api/conversation/<id>/interpreter/download`, and both stop working once the conversation or its sandbox is gone.

## 0.11.6

Three rough edges found when an unfamiliar, sandboxed agent installed from the GitHub link:

- **`setup` no longer stops when the skill cannot be installed.** Writing `~/.claude/skills` or `~/.codex/skills` can be refused (a sandboxed agent, a read-only home). Setup now prints a warning and continues, so the config is written and the "load the extension" steps are shown. `setup --no-skill` skips the skill on purpose.
- **`verify` tells you which extension version answered.** The extension reports its version in the ping reply, and `verify` prints `Extension X answered in <browser>`. When X differs from this project's version it suggests `reload`. Older extensions send no version and are reported as such.
- **INSTALL.md explains how to keep everything in one folder:** `CONVO_VAULT_HOME` (config), `--out` (exports) and `setup --no-skill`.

## 0.11.5

- **The skill is now called `convo-vault-skill`.** With the project's own name, agents could not tell whether "convo-vault" meant the project or the skill. The folder is `skills/convo-vault-skill`, and `skill install` removes the old `convo-vault` folder when it is this skill's.

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
