---
name: convo-vault
description: Export a ChatGPT conversation into a local knowledge pack (Markdown, PDF, JSONL, QA pairs, agent trace) with no manual clicking. Use when the user asks to download, save, archive, back up, export or import a ChatGPT conversation or chat history, gives a chatgpt.com/c/... link or conversation id, or shares a screenshot of a ChatGPT conversation and wants its full content. 触发词：下载/导出/保存/归档 ChatGPT 对话、把这段对话存下来、这个对话的链接或截图。
---

# Convo Vault: export a ChatGPT conversation

Convo Vault turns a ChatGPT conversation into a local folder with `.md`, `.pdf`, structured JSON/JSONL, assets and the model's full thinking and tool trace. This skill runs it end to end. **Do not ask the user to open the extension, pick Fast/Hybrid/Full, click Start Scan or export by hand.** Run the command below.

## 1. Find the conversation

Get one `chatgpt.com/c/<id>` link (or a bare conversation id), from the first of these that works:

1. The user's message: a pasted link or id.
2. A screenshot: read the address bar. The URL is usually visible; read the `/c/<id>` part carefully, ids are 36 characters like `68f3c1a2-5b7e-4c1d-9a0e-2f6b8d4e7a11`.
3. A browser tool you already have (Claude in Chrome, a browser MCP): read the URL of the open ChatGPT tab.
4. Otherwise ask the user once for the link. Do not guess an id from a conversation title.

## 2. Export

```bash
node "{{CLI}}" export "<url-or-id>"
```

- Use the default mode (Fast). Only add `--mode hybrid` or `--mode full` if the user explicitly wants page-only details such as thinking panels the API does not return.
- It starts the local renderer if needed, opens the conversation in the user's browser, where the Convo Vault extension exports it by itself, and closes the tab when done. The user's browser must be signed in to ChatGPT. Expect 10 to 60 seconds; long conversations take longer. Run it in the foreground and wait, timeout at least 10 minutes.
- Progress goes to stderr. The last stdout lines list the result: the unpacked folder, the `.zip`, and the main files.
- Output goes to `~/Downloads/convo-vault/` unless the user names a place: add `--out "<dir>"`.
- Add `--no-pdf` when the user only wants the data (Markdown, JSON, JSONL): it is faster and needs no PDF renderer.
- The local renderer starts and stops by itself (it exits two minutes after the last export). Never ask the user to start or close a terminal for it.
- Several conversations: run the command once per link, one after another.

## 3. After it finishes

- Tell the user where the folder is and list the key files: `*.md` (readable), `*.pdf`, `*.summary.md`, `*.agent-trace.md`.
- If the user wanted something done with the conversation (summarize, continue the work, extract decisions), read the `.md` or `*.messages.jsonl` from the folder and do it. Do not paste the whole conversation back.
- The integrity gate can refuse an incomplete capture. Report that message to the user. Do not retry with `--allow-incomplete` unless they say they accept a partial export.

## 4. When it fails

| Message | What to do |
| --- | --- |
| `did not pick up the job` / extension did not respond | The extension is not loaded, is switched off on the extensions page, or ChatGPT is not signed in in that browser. Tell the user to run `node "{{CLI}}" setup` once, or load `dist/convo-vault-extension` in the browser. Try `--browser "Microsoft Edge"` if they use another browser. |
| `Renderer dependencies are not installed` | Run `node "{{CLI}}" setup`. |
| `cannot run export jobs` | An old renderer is running. Run `node "{{CLI}}" backend stop` and export again. |
| `Capture is incomplete` | Report the listed issues. Offer `--mode hybrid` or ask whether a partial export is acceptable. |
| Anything else | Run `node "{{CLI}}" doctor` and show the user its output. |

Never read or ask for the user's ChatGPT cookies, tokens or password. The extension uses the signed-in browser session; nothing leaves the machine.
