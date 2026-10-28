---
name: convo-vault-skill
description: Export a ChatGPT conversation into a local knowledge pack (Markdown, PDF, JSONL, QA pairs, agent trace) with no manual clicking. Use when the user asks to download, save, archive, back up, export or import a ChatGPT conversation or chat history, gives a chatgpt.com/c/... link or conversation id, or shares a screenshot of a ChatGPT conversation and wants its full content. 触发词：下载/导出/保存/归档 ChatGPT 对话、把这段对话存下来、这个对话的链接或截图。
---

# Convo Vault: export a ChatGPT conversation

Convo Vault turns a ChatGPT conversation into a local folder with `.md`, `.pdf`, structured JSON/JSONL, assets and the model's full thinking and tool trace. This skill runs it end to end. **Do not ask the user to open the extension, pick Fast/Hybrid/Full, click Start Scan or export by hand.** Run the command below.

## 1. Find the conversation

Get one `chatgpt.com/c/<id>` link (or a bare conversation id), from the first of these that works:

1. The user's message: a pasted link or id.
2. A screenshot: read the address bar. The URL is usually visible; read the `/c/<id>` part carefully, ids are 36 characters like `68f3c1a2-5b7e-4c1d-9a0e-2f6b8d4e7a11`.
3. A browser tool you already have (Claude in Chrome, a browser MCP): read the URL of the open ChatGPT tab.
4. The user names a project or some titles instead of giving links ("everything in my Research project"): list them, do not ask for links.

```bash
node "{{SKILL_DIR}}/scripts/run.mjs" list --project "Research"
```

   It prints each conversation's id, date and title (`--json` for data; without `--project` it lists recent conversations). Pick the ones the user means by title; if a match is unclear, show the user the candidates and ask.
5. Otherwise ask the user once for the link. Do not guess an id from a conversation title.

Grok and Gemini conversations work too: a `grok.com/c/<id>` or `gemini.google.com/app/<id>` link is exported the same way. Grok links run several in one tab; each Gemini link gets its own tab. For both, `list`, `--project` and `--files` do not apply yet. Gemini is read from the page (it scrolls to the top first), so it takes longer and the output carries a warning that Gemini gives no message count.

## 2. Ask once about files

The conversation, its thinking and tool trace and its images are always exported. **Files** are different: Word, PDF, zip and other documents the user uploaded to the conversation or ChatGPT generated in it. They can be many and large, so by default they are **not** downloaded; the export only lists them in `*.assets.manifest.json` as "not requested".

Before exporting, ask the user one short question, in their language, with the default stated. For example: "Besides the conversation and the model's thinking, should I also download the files uploaded and generated in it (Word, PDF, zip)? Default is no."

- A clear yes ("yes", "all of them", "include the attachments", "连文件一起下") → add `--files`.
- Anything else → leave `--files` off: "no", a vague or unrelated reply, no reply, or a setting where you cannot ask. Do not ask twice or press.
- Skip the question when the user already said it in the request ("download the attachments too", "just the conversation, no files").
- With several conversations, ask once; if the user wants files for only some of them, use `--files-for` with their names.

## 3. Export

```bash
node "{{SKILL_DIR}}/scripts/run.mjs" export "<url-or-id>"
```

- `scripts/run.mjs` finds the Convo Vault project, or installs it from GitHub the first time, then runs its CLI. It starts the local renderer if needed, opens the conversation in the user's browser, where the Convo Vault extension exports it by itself, and closes the tab when done. The user's browser must be signed in to ChatGPT. Expect 10 to 60 seconds; long conversations take longer. Run it in the foreground and wait, timeout at least 10 minutes.
- Progress goes to stderr. The last stdout lines list the result: the unpacked folder, the `.zip`, and the main files.
- Output goes to `~/Downloads/convo-vault/` unless the user names a place: add `--out "<dir>"`.
- Add `--files` only when the user said yes in step 2. It downloads uploaded and generated files into `assets/files/` with the browser's ChatGPT session and records size and SHA-256 in the manifest. Files that cannot be downloaded (ChatGPT has already deleted the conversation's sandbox, a file over 64 MB, more than 120 MB in one export) are listed with the reason; the export itself still succeeds.
- Add `--no-pdf` when the user only wants the data (Markdown, JSON, JSONL): it is faster and needs no PDF renderer.
- The local renderer starts and stops by itself (it exits two minutes after the last export). Never ask the user to start or close a terminal for it.
- Several conversations: pass them all to ONE command, `export <link> <link> ...` (ids work too). They run in a single browser tab, one after another, so nothing pops up per conversation; the output lists each result and any failure, and the exit code is 1 if any failed. Never start several export commands at once.
- A whole project: `export --project "Research"` exports every conversation in it (add links to include others).
- Files for only some: `--files-for "invoice,report"` downloads files only for the conversations whose title contains one of those words (or whose id is given). `--files` means every conversation. Use it when the user wants attachments for some conversations and not others.

## 4. After it finishes

- Tell the user where the folder is and list the key files: `*.md` (readable), `*.pdf`, `*.summary.md`, `*.agent-trace.md`.
- If files were requested, report how many were stored and how many failed (`fileDownload` in `*.assets.manifest.json`: `requested`, `total`, `stored`, `failed`), and name the main failure reason. If files were not requested but the manifest lists some, you may tell the user they can ask for them and re-run with `--files`.
- If the user wanted something done with the conversation (summarize, continue the work, extract decisions), read the `.md` or `*.messages.jsonl` from the folder and do it. Do not paste the whole conversation back.
- The integrity gate can refuse an incomplete capture. Report that message to the user. Do not retry with `--allow-incomplete` unless they say they accept a partial export.

## 5. When it fails

| Message | What to do |
| --- | --- |
| `did not pick up the job` / extension did not respond | The extension is not loaded, is switched off on the extensions page, or ChatGPT is not signed in in that browser. Tell the user to run `node "{{SKILL_DIR}}/scripts/run.mjs" setup` once, or load `dist/convo-vault-extension` in the browser. Try `--browser "Microsoft Edge"` if they use another browser. |
| `Renderer dependencies are not installed` | Run `node "{{SKILL_DIR}}/scripts/run.mjs" setup`. |
| `cannot run export jobs` | An old renderer is running. Run `node "{{SKILL_DIR}}/scripts/run.mjs" backend stop` and export again. |
| `Capture is incomplete` | Report the listed issues and ask whether a partial export is acceptable. |
| Anything else | Run `node "{{SKILL_DIR}}/scripts/run.mjs" doctor` and show the user its output. |

Never read or ask for the user's ChatGPT cookies, tokens or password. The extension uses the signed-in browser session; nothing leaves the machine.
