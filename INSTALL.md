# For agents: install and use Convo Vault

When a user asks you to install this project, follow these steps. The goal: afterwards the user only has to say "export this ChatGPT conversation <link or screenshot>".

A Chinese version is in [INSTALL.zh-CN.md](INSTALL.zh-CN.md).

## Install

1. **Pick a location.** Use `~/convo-vault` unless the user names another.
2. **Get the code.** This skips the files only developers need (tests, docs images, CI):

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/amethyst-cosmos/convo-vault.git <location> && git -C <location> sparse-checkout set --no-cone '/*' '!/tests/' '!/docs/' '!/.github/' '!/AGENTS.md' '!/CONTRIBUTING.md' '!/eslint.config.mjs'
   ```

   If that fails (an old git), use `git clone --depth 1 https://github.com/amethyst-cosmos/convo-vault.git <location>`. Without git, download the latest release zip and unzip it.
3. **Check Node 20 or newer.** Run `node -v`. If it is missing or too old, help the user install it (`brew install node` on macOS, `winget install OpenJS.NodeJS.LTS` on Windows, or their own mise or nvm).
4. **Run setup.**

   ```bash
   cd <location> && node cli/convo-vault.mjs setup
   ```

   It installs the renderer dependencies, builds the extension, installs the skill for Claude and Codex (whichever it finds) and opens the browser's extensions page. If the user's browser is not Chrome, add `--browser edge` (or `brave`).
5. **Ask the user to load the extension. This is the only manual step, and it happens once.**
   1. Open the extensions page (`chrome://extensions` or `edge://extensions`) and turn on **Developer mode**.
   2. Click **Load unpacked** and choose `<location>/dist/convo-vault-extension`.
   3. Sign in to ChatGPT in that browser.

   Browsers do not let programs install unpublished extensions, so do not pretend you can do this for the user.
6. **Verify.** Run `node cli/convo-vault.mjs verify`. It opens a ChatGPT page and confirms the extension answers, printing `OK: Extension <version> answered in <browser>`. If that version differs from this project's (`extension/manifest.json`), it suggests running `node cli/convo-vault.mjs reload`, or reloading the extension on the extensions page. If it fails, relay the message, let the user finish step 5, and try again.
7. **Optional, for Claude desktop's normal chat (not the Code tab).** Run `node cli/convo-vault.mjs mcp install`, then ask the user to fully quit and reopen Claude desktop. For other MCP clients, use the settings printed by `node cli/convo-vault.mjs mcp config`.
8. **Tell the user** to open a new session: a newly installed skill is only picked up by sessions started afterwards.

## Use

When the user gives a conversation link or a screenshot (the address bar shows `chatgpt.com/c/<id>`), run:

```bash
node <location>/cli/convo-vault.mjs export "<link>"
```

The whole conversation is exported, and the result is in `~/Downloads/convo-vault/<title>/`. Do not ask the user to click the popup. The only question is whether to also download the files uploaded and generated in the conversation (default no, `--files`); the installed skill says how to ask. The installed `convo-vault-skill` has the detailed rules.

## Keep everything in one folder

By default Convo Vault writes outside the project: its config to `~/.convo-vault`, the skill to `~/.claude/skills` and `~/.codex/skills`, and exports to `~/Downloads/convo-vault`. To keep it all in one folder (for example when you are sandboxed to your working folder):

- `CONVO_VAULT_HOME=<folder>` moves the config folder. Set it for every command, e.g. `CONVO_VAULT_HOME=$PWD/.state node cli/convo-vault.mjs setup`.
- `--out <folder>` saves an export there, e.g. `node cli/convo-vault.mjs export "<link>" --out ./exports`.
- `setup --no-skill` skips installing the skill, or use `skill install --dir <folder>` to put the skill in a folder of your choice.

An agent that is sandboxed to its working folder will need the user's approval to write `~/.claude`, `~/.codex` and `~/.convo-vault`. If writing the skill is refused, `setup` still finishes and only warns about it. Set `CONVO_VAULT_HOME` so the config stays in your folder too.

## Update and troubleshoot

- Update: `node <location>/cli/convo-vault.mjs update` pulls the latest code and reinstalls. If the extension is already loaded, ask the user to reload it on the extensions page.
- Check: `node <location>/cli/convo-vault.mjs doctor`.
- The renderer starts automatically on export and exits when idle. Its log is `<location>/.convo-vault/backend.log`.

## Do not

- Do not read, ask for or paste the user's ChatGPT cookies, tokens or password. The extension uses the session already in the browser.
- Do not upload conversation content to any online service. Everything stays on the machine.
- Do not export an incomplete capture with `--allow-incomplete` unless the user agrees.
