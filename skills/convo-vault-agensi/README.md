# convo-vault-agensi

The text-only version of the Convo Vault skill, as listed on [Agensi](https://www.agensi.io/skills/convo-vault-chat-exporter).

Agensi serves skills to the agent as text over MCP, so this folder holds only `SKILL.md`. It has no launcher script: the skill offers a source checkout or a verified GitHub Release ZIP. The portable ZIP can be unpacked into a local folder the user chooses and checked with `node cli/convo-vault.mjs setup --verify --no-open --no-skill`.

Use `skills/convo-vault-skill` instead when you install the skill locally (Claude Code, Codex). That one carries its own launcher and is installed by `node cli/convo-vault.mjs setup`.

Editing: changing the wording of the live listing takes effect at once; uploading a new zip to Agensi goes through review again. The zip contains only `SKILL.md`.
