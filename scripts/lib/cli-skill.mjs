import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { repoRoot } from "./cli-backend.mjs";

const SKILL_NAME = "convo-vault";
const TEMPLATE_PATH = path.join(repoRoot, "skills", SKILL_NAME, "SKILL.md");

// Agents that read SKILL.md folders, with the folder they scan.
const AGENTS = {
  claude: { label: "Claude Code / Claude desktop", dir: path.join(os.homedir(), ".claude", "skills") },
  codex: { label: "Codex", dir: path.join(os.homedir(), ".codex", "skills") }
};

export function listAgentTargets() {
  return Object.entries(AGENTS).map(([id, agent]) => ({ id, ...agent }));
}

/**
 * Installs the skill for the requested agents ("auto" = those whose config
 * folder already exists). The CLI's absolute path is written into SKILL.md so
 * the agent can run it from any working directory.
 */
export async function installSkill(target = "auto") {
  const template = await fs.readFile(TEMPLATE_PATH, "utf8");
  const cliPath = path.join(repoRoot, "scripts", "convo-vault.mjs");
  const content = template.replaceAll("{{CLI}}", cliPath);
  const ids = target === "all" ? Object.keys(AGENTS)
    : target === "auto" ? await detectAgents()
      : [target];
  const installed = [];

  for (const id of ids) {
    const agent = AGENTS[id];
    if (!agent) throw new Error(`Unknown agent "${id}". Use claude, codex, all, or auto.`);
    const skillDir = path.join(agent.dir, SKILL_NAME);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
    installed.push({ id, label: agent.label, path: path.join(skillDir, "SKILL.md") });
  }

  return installed;
}

async function detectAgents() {
  const found = [];
  for (const [id, agent] of Object.entries(AGENTS)) {
    const exists = await fs.stat(path.dirname(agent.dir)).then((stat) => stat.isDirectory(), () => false);
    if (exists) found.push(id);
  }
  return found;
}

export async function skillStatus() {
  const status = [];
  for (const [id, agent] of Object.entries(AGENTS)) {
    const file = path.join(agent.dir, SKILL_NAME, "SKILL.md");
    status.push({ id, label: agent.label, path: file, installed: await fs.stat(file).then(() => true, () => false) });
  }
  return status;
}
