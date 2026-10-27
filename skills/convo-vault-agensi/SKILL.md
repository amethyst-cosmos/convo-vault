---
name: Convo Vault ChatGPT Exporter
description: Export a ChatGPT conversation into a local knowledge pack (Markdown, PDF, JSONL, QA pairs, thinking and tool trace). Use when the user wants to download, save, archive or back up a ChatGPT conversation, or gives a chatgpt.com/c/... link, a conversation id or a screenshot of one. 触发词：下载、导出、保存、归档 ChatGPT 对话。
summary: Tell your agent to export a ChatGPT conversation. It sets up the free open-source Convo Vault once, then saves the full chat locally as Markdown, PDF and structured data.
version: 0.1.0
tags: chatgpt, export, archive, markdown, pdf, jsonl, knowledge-base, backup
keywords: chatgpt export, chatgpt backup, conversation archive, agent-ready knowledge pack
use_cases: Back up an important ChatGPT conversation, Turn a long chat into Markdown and PDF, Feed a ChatGPT conversation to another agent, Keep the model's thinking and tool trace with the chat
docs_url: https://github.com/amethyst-cosmos/convo-vault
---

# Convo Vault ChatGPT Exporter

This skill drives Convo Vault, a free, open-source (MIT) tool at https://github.com/amethyst-cosmos/convo-vault. Convo Vault runs entirely on the user's computer: a small browser extension reads the ChatGPT tab the user is already signed in to, and a local service writes the files. Nothing is uploaded anywhere.

Requires: Node.js 20 or newer, git, a Chromium browser (Chrome, Edge, Brave) signed in to ChatGPT, and a terminal the agent can use.

The user only has to say "export this ChatGPT conversation" and give a link or a screenshot. Do the rest, except the one browser step in section 2, which only the user can do.

## 1. Find the conversation

Get one `chatgpt.com/c/<id>` link (or a bare conversation id) from the first of these that works:

1. The user's message: a pasted link or id.
2. A screenshot: read the address bar. Ids are 36 characters like `68f3c1a2-5b7e-4c1d-9a0e-2f6b8d4e7a11`; read them carefully.
3. A browser tool you already have: read the URL of the open ChatGPT tab.
4. Otherwise ask the user once for the link. Never guess an id from a conversation title.

## 2. First time only: set up Convo Vault

Check whether Convo Vault is already installed:

```bash
test -f "$HOME/convo-vault/cli/convo-vault.mjs" && echo installed || echo missing
```

If it prints `installed`, go to section 3. If the user keeps it somewhere else, they will say so; use that folder in place of `$HOME/convo-vault` everywhere below.

If it prints `missing`, tell the user plainly what you are about to do and wait for a clear yes before running anything:

> To export, I need to set up Convo Vault, a free open-source tool, on this computer. I will download it from https://github.com/amethyst-cosmos/convo-vault into `~/convo-vault`, install its dependencies and build its browser extension. Nothing is uploaded and nothing outside that folder is changed. Is that OK?

After a yes:

1. Check Node: `node -v` must print v20 or newer. If it does not, help the user install a current Node.js first (for example `brew install node` on macOS), then continue.
2. Download the project:

```bash
git clone --depth 1 https://github.com/amethyst-cosmos/convo-vault.git "$HOME/convo-vault"
```

If git is missing, ask the user to install it, or to download the latest release zip from https://github.com/amethyst-cosmos/convo-vault/releases and unzip it to `~/convo-vault`.

3. Set it up. This installs dependencies and builds the extension, and does not touch any agent's skill folders:

```bash
cd "$HOME/convo-vault" && node cli/convo-vault.mjs setup --no-skill
```

4. Ask the user to load the extension. **This is the one manual step, once per browser.** Browsers do not let a program install an unpublished extension, so do not try to do it for them. Tell them:
   1. Open the browser's extensions page (`chrome://extensions` or `edge://extensions`) and turn on **Developer mode**.
   2. Click **Load unpacked** and choose the folder `~/convo-vault/dist/convo-vault-extension`.
   3. Open https://chatgpt.com in that browser and sign in.

5. Verify, then continue once it prints `OK`:

```bash
cd "$HOME/convo-vault" && node cli/convo-vault.mjs verify
```

### Updating later

When the user asks to update Convo Vault, or an export fails after a ChatGPT change, run:

```bash
cd "$HOME/convo-vault" && node cli/convo-vault.mjs update --no-skill
```

It pulls the latest version, rebuilds the extension and reloads it in the browser by itself. The user does not need to open the Extensions page or click anything. Exports also reload an out-of-date extension on their own once the project has been updated, so there is nothing to tell the user to refresh. Only if the output says the extension did not take the reload, ask the user to click the reload icon on the Extensions page once.

## 3. Ask once about files

The conversation, the model's thinking and tool trace, and its images are always exported. **Files** (Word, PDF, zip and other documents uploaded to the conversation or generated in it) can be many and large, so by default they are not downloaded; the export only lists them as "not requested".

Ask the user one short question in their language, with the default stated, for example: "Besides the conversation and the model's thinking, should I also download the files uploaded and generated in it? Default is no."

- A clear yes ("yes", "all of them", "include the attachments", "连文件一起下") adds `--files`.
- Anything else leaves `--files` off. Do not ask twice.
- Skip the question when the user already said it in the request.
- With several links, ask once and apply the answer to all of them.

## 4. Export

```bash
node "$HOME/convo-vault/cli/convo-vault.mjs" export "<url-or-id>"
```

- It starts the local renderer if needed, opens the conversation in the user's browser where the extension exports it by itself, and closes the tab when done. Expect 10 to 60 seconds; long conversations take longer. Run it in the foreground and wait, with a timeout of at least 10 minutes.
- Progress goes to stderr. The last lines on stdout list the result folder, the `.zip` and the main files.
- Output goes to `~/Downloads/convo-vault/` unless the user names a place; then add `--out "<dir>"`.
- Add `--files` only when the user said yes in section 3.
- Add `--no-pdf` when the user only wants the data (Markdown, JSON, JSONL): it is faster.
- For several conversations, run the command once per link, one after another.

## 5. After it finishes

- Tell the user where the folder is and list the key files: `*.md` (readable), `*.pdf`, `*.summary.md`, `*.agent-trace.md`.
- If files were requested, report how many were stored and how many failed (`fileDownload` in `*.assets.manifest.json`: `requested`, `total`, `stored`, `failed`) and the main failure reason.
- If the user wants something done with the conversation (summarize it, continue the work, pull out decisions), read the `.md` or `*.messages.jsonl` from the folder and do that. Do not paste the whole conversation back.
- Convo Vault checks every export message by message and refuses an incomplete capture. Report that message to the user. Do not retry with `--allow-incomplete` unless they say a partial export is fine.

## 6. When it fails

| Message | What to do |
| --- | --- |
| `did not pick up the job` / extension did not respond | The extension is not loaded, is switched off, or ChatGPT is not signed in in that browser. Repeat the extension step in section 2, or add `--browser "Microsoft Edge"` if they use another browser. |
| `Renderer dependencies are not installed` | Run `cd "$HOME/convo-vault" && node cli/convo-vault.mjs setup --no-skill`. |
| `cannot run export jobs` | An old renderer is running. Run `node "$HOME/convo-vault/cli/convo-vault.mjs" backend stop`, then export again. |
| `Capture is incomplete` | Report the listed issues and ask whether a partial export is acceptable. |
| Anything else | Run `node "$HOME/convo-vault/cli/convo-vault.mjs" doctor` and show the user its output. |

Never read or ask for the user's ChatGPT cookies, tokens or password. The extension uses the browser's own signed-in session.

## Limits

- Needs a desktop Chromium browser with the extension loaded once; it does not work from a phone or from a browser without it.
- Exports one conversation per link; it does not bulk-export a whole account.
- ChatGPT can change its internal format. If an export fails after a ChatGPT update, check the project's releases for a fix: https://github.com/amethyst-cosmos/convo-vault/releases
