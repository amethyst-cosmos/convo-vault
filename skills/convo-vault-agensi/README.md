# convo-vault-agensi

The text-only version of the Convo Vault skill, as listed on [Agensi](https://www.agensi.io/skills/convo-vault-chat-exporter).

Agensi serves the skill instructions over MCP. The upload ZIP contains `SKILL.md`. The agent can guide a source checkout or a verified GitHub Release ZIP. The portable ZIP can be unpacked into a local folder the user chooses and checked with `node cli/convo-vault.mjs setup --verify --no-open --no-skill`.

The local export keeps text in its original languages and includes `*.decision-path.md` for available progress notes, summaries and tool activity. ChatGPT and Grok can provide those records. Gemini coverage is based on visible messages and images.

Use `skills/convo-vault-skill` instead when you install the skill locally (Claude Code, Codex). That one carries its own launcher and is installed by `node cli/convo-vault.mjs setup`.

Editing: changing the wording of the live listing takes effect at once; uploading a new zip to Agensi goes through review again. The zip contains only `SKILL.md`.
