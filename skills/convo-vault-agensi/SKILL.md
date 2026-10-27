---
name: Convo Vault ChatGPT Exporter
description: Export ChatGPT conversations, one, several or a whole project, into a local knowledge pack (Markdown, PDF, JSONL, QA pairs, thinking and tool trace). Use when the user wants to download, save, archive or back up ChatGPT conversations, names a ChatGPT project, or gives a chatgpt.com/c/... link, a conversation id or a screenshot of one. Works on macOS, Windows and Linux. 触发词：下载、导出、保存、归档 ChatGPT 对话。
summary: Tell your agent to export ChatGPT conversations, one or a whole project. It sets up the free open-source Convo Vault once, then saves each chat locally as Markdown, PDF and structured data. Windows and macOS.
version: 0.2.0
tags: chatgpt, export, archive, markdown, pdf, jsonl, knowledge-base, backup
keywords: chatgpt export, chatgpt backup, conversation archive, chatgpt project export, agent-ready knowledge pack
use_cases: Back up an important ChatGPT conversation, Export every conversation in a ChatGPT project at once, Turn a long chat into Markdown and PDF, Feed a ChatGPT conversation to another agent, Keep the model's thinking and tool trace with the chat
docs_url: https://github.com/amethyst-cosmos/convo-vault
---

# Convo Vault ChatGPT Exporter

This skill drives Convo Vault, a free, open-source (MIT) tool at https://github.com/amethyst-cosmos/convo-vault. Convo Vault runs entirely on the user's computer: a small browser extension reads the ChatGPT tab the user is already signed in to, and a local service writes the files. Nothing is uploaded anywhere.

Requires: Node.js 20 or newer, git, a Chromium browser (Chrome, Edge, Brave) signed in to ChatGPT, and a terminal the agent can use. It works on macOS, Windows and Linux.

The user only has to say "export this ChatGPT conversation" (or "everything in my Research project") and give a link, a screenshot or a project name. Do the rest, except the one browser step in section 2, which only the user can do.

## How to run the commands

Convo Vault is installed in `$HOME/convo-vault`. That path works as written in macOS and Linux shells, Git Bash and Windows PowerShell. In Windows Command Prompt write `%USERPROFILE%\convo-vault` instead. If the user keeps it somewhere else, they will say so; use that folder in its place everywhere below.

Run each command on its own line and wait for it to finish. Do not join commands with `&&`: Windows PowerShell 5.1 does not support it. Quote paths with double quotes. Every command below can be run from any folder.

## 1. Find the conversations

Get the `chatgpt.com/c/<id>` links (or bare conversation ids) from the first of these that works:

1. The user's message: pasted links or ids.
2. A screenshot: read the address bar. Ids are 36 characters like `68f3c1a2-5b7e-4c1d-9a0e-2f6b8d4e7a11`; read them carefully.
3. A browser tool you already have: read the URL of the open ChatGPT tab.
4. The user names a project or some titles instead of giving links ("everything in my Research project"): list them, do not ask for links.

```
node "$HOME/convo-vault/cli/convo-vault.mjs" list --project "Research"
```

   It prints each conversation's id, date and title (`--json` for data; without `--project` it lists recent conversations). Pick the ones the user means by title; if a match is unclear, show the user the candidates and ask.
5. Otherwise ask the user once for the link. Never guess an id from a conversation title.

## 2. First time only: set up Convo Vault

Check whether Convo Vault is already installed: does the file `$HOME/convo-vault/cli/convo-vault.mjs` exist? Use your file tools, or one of these:

```
test -f "$HOME/convo-vault/cli/convo-vault.mjs" && echo installed || echo missing
```

```
if (Test-Path "$HOME/convo-vault/cli/convo-vault.mjs") { "installed" } else { "missing" }
```

The first is for macOS, Linux and Git Bash, the second for Windows PowerShell.

If it is installed, go to section 3. If it is missing, tell the user plainly what you are about to do and wait for a clear yes before running anything:

> To export, I need to set up Convo Vault, a free open-source tool, on this computer. I will download it from https://github.com/amethyst-cosmos/convo-vault into a `convo-vault` folder in your user folder, install its dependencies and build its browser extension. Nothing is uploaded and nothing outside that folder is changed. Is that OK?

After a yes:

1. Check Node: `node -v` must print v20 or newer. If it does not, help the user install a current Node.js first: `brew install node` on macOS, `winget install OpenJS.NodeJS.LTS` on Windows, or the distribution's package on Linux. If `node` is still not found right after installing it, open a new terminal so it picks up the new PATH.
2. Download the project. These two commands skip the files only developers need (tests, docs images, CI):

```
git clone --depth 1 --filter=blob:none --sparse https://github.com/amethyst-cosmos/convo-vault.git "$HOME/convo-vault"
```

```
git -C "$HOME/convo-vault" sparse-checkout set --no-cone '/*' '!/tests/' '!/docs/' '!/.github/' '!/AGENTS.md' '!/CONTRIBUTING.md' '!/eslint.config.mjs'
```

If the first fails because git is old, delete any half-made folder it left and use a plain `git clone --depth 1 https://github.com/amethyst-cosmos/convo-vault.git "$HOME/convo-vault"`. If git is missing, ask the user to install it (`winget install Git.Git` on Windows), or to download the latest release zip from https://github.com/amethyst-cosmos/convo-vault/releases and unzip it to `$HOME/convo-vault`.

3. Set it up. This installs dependencies and builds the extension, and does not touch any agent's skill folders:

```
node "$HOME/convo-vault/cli/convo-vault.mjs" setup --no-skill
```

4. Ask the user to load the extension. **This is the one manual step, once per browser.** Browsers do not let a program install an unpublished extension, so do not try to do it for them. Give them the full path of the folder `convo-vault/dist/convo-vault-extension` inside the install folder (for example `C:\Users\<name>\convo-vault\dist\convo-vault-extension` on Windows, `/Users/<name>/convo-vault/dist/convo-vault-extension` on macOS) and tell them:
   1. Open the browser's extensions page (`chrome://extensions` or `edge://extensions`) and turn on **Developer mode**.
   2. Click **Load unpacked** and choose that folder.
   3. Open https://chatgpt.com in that browser and sign in.

5. Verify, then continue once it prints `OK`:

```
node "$HOME/convo-vault/cli/convo-vault.mjs" verify
```

### Updating later

When the user asks to update Convo Vault, or an export fails after a ChatGPT change, run:

```
node "$HOME/convo-vault/cli/convo-vault.mjs" update --no-skill
```

It pulls the latest version, rebuilds the extension and reloads it in the browser by itself. The user does not need to open the Extensions page or click anything. Exports also reload an out-of-date extension on their own once the project has been updated, so there is nothing to tell the user to refresh. Only if the output says the extension did not take the reload, ask the user to click the reload icon on the Extensions page once.

## 3. Ask once about files

The conversation, the model's thinking and tool trace, and its images are always exported. **Files** (Word, PDF, zip and other documents uploaded to the conversation or generated in it) can be many and large, so by default they are not downloaded; the export only lists them as "not requested".

Ask the user one short question in their language, with the default stated, for example: "Besides the conversation and the model's thinking, should I also download the files uploaded and generated in it? Default is no."

- A clear yes ("yes", "all of them", "include the attachments", "连文件一起下") adds `--files`.
- Anything else leaves `--files` off. Do not ask twice.
- Skip the question when the user already said it in the request.
- With several conversations, ask once; if the user wants files for only some of them, use `--files-for` with their names.

## 4. Export

```
node "$HOME/convo-vault/cli/convo-vault.mjs" export "<url-or-id>"
```

- It starts the local renderer if needed, opens the conversation in the user's browser where the extension exports it by itself, and closes the tab when done. Expect 10 to 60 seconds; long conversations take longer. Run it in the foreground and wait, with a timeout of at least 10 minutes.
- Progress goes to stderr. The last lines on stdout list the result folder, the `.zip` and the main files.
- Output goes to the `Downloads/convo-vault` folder in the user's user folder (`C:\Users\<name>\Downloads\convo-vault` on Windows) unless the user names a place; then add `--out "<dir>"`.
- Add `--files` only when the user said yes in section 3.
- Add `--no-pdf` when the user only wants the data (Markdown, JSON, JSONL): it is faster.
- Several conversations: pass them all to ONE command, `export <link> <link> ...` (ids work too). They run in a single browser tab, one after another, so nothing pops up per conversation; the output lists each result and any failure, and the exit code is 1 if any failed. Never start several export commands at once.
- A whole project: `export --project "Research"` exports every conversation in it (add links to include others).
- Files for only some: `--files-for "invoice,report"` downloads files only for the conversations whose title contains one of those words (or whose id is given). `--files` means every conversation. Use it when the user wants attachments for some conversations and not others.
- On macOS the browser tab opens in the background. On Windows and Linux the browser window may come to the front once per run, not once per conversation.

## 5. After it finishes

- Tell the user where the folder is and list the key files: `*.md` (readable), `*.pdf`, `*.summary.md`, `*.agent-trace.md`.
- If files were requested, report how many were stored and how many failed (`fileDownload` in `*.assets.manifest.json`: `requested`, `total`, `stored`, `failed`) and the main failure reason.
- If the user wants something done with a conversation (summarize it, continue the work, pull out decisions), read its `.md` or `*.messages.jsonl` from the folder and do that. Do not paste the whole conversation back.
- Convo Vault checks every export message by message and refuses an incomplete capture. Report that message to the user. Do not retry with `--allow-incomplete` unless they say a partial export is fine.

## 6. When it fails

| Message | What to do |
| --- | --- |
| `did not pick up the job` / extension did not respond | The extension is not loaded, is switched off, or ChatGPT is not signed in in that browser. Repeat the extension step in section 2, or add `--browser "Microsoft Edge"` if they use another browser. |
| `Renderer dependencies are not installed` | Run `node "$HOME/convo-vault/cli/convo-vault.mjs" setup --no-skill`. |
| `cannot run export jobs` | An old renderer is running. Run `node "$HOME/convo-vault/cli/convo-vault.mjs" backend stop`, then export again. |
| `Capture is incomplete` | Report the listed issues and ask whether a partial export is acceptable. |
| `No project named ...` | Show the user the project names the message lists and ask which one they mean. |
| `node` or `git` not found | Install it as in section 2, then open a new terminal. |
| Anything else | Run `node "$HOME/convo-vault/cli/convo-vault.mjs" doctor` and show the user its output. |

Never read or ask for the user's ChatGPT cookies, tokens or password. The extension uses the browser's own signed-in session.

## Limits

- Needs a desktop Chromium browser with the extension loaded once; it does not work from a phone or from a browser without it.
- Exports the conversations you name or one project's; it does not export a whole account in one go.
- ChatGPT can change its internal format. If an export fails after a ChatGPT update, update Convo Vault, then check the project's releases for a fix: https://github.com/amethyst-cosmos/convo-vault/releases
