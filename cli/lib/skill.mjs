import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { repoRoot } from "./backend.mjs";

const SKILL_NAME = "convo-vault";
const SKILL_SOURCE = path.join(repoRoot, "skills", SKILL_NAME);

// Agents that read SKILL.md folders, with the folder they scan.
const AGENTS = {
  claude: { label: "Claude Code / Claude desktop", dir: path.join(os.homedir(), ".claude", "skills") },
  codex: { label: "Codex", dir: path.join(os.homedir(), ".codex", "skills") }
};

export function listAgentTargets() {
  return Object.entries(AGENTS).map(([id, agent]) => ({ id, ...agent }));
}

/**
 * Installs the skill folder (SKILL.md, scripts, agents) for the requested agents
 * ("auto" = those whose config folder already exists), or into `options.dir` when a
 * folder is given. The folder's own path is written into SKILL.md so the agent can run
 * its script from any working directory.
 */
export async function installSkill(target = "auto", options = {}) {
  const destinations = [];

  if (options.dir) {
    destinations.push({ id: "folder", label: "Folder", parent: path.resolve(options.dir) });
  } else {
    const ids = target === "all" ? Object.keys(AGENTS)
      : target === "auto" ? await detectAgents()
        : [target];

    for (const id of ids) {
      const agent = AGENTS[id];
      if (!agent) throw new Error(`Unknown agent "${id}". Use claude, codex, all, or auto.`);
      destinations.push({ id, label: agent.label, parent: agent.dir });
    }
  }

  const installed = [];

  for (const destination of destinations) {
    const skillDir = path.join(destination.parent, SKILL_NAME);
    await copySkillFolder(SKILL_SOURCE, skillDir, skillDir);
    installed.push({ id: destination.id, label: destination.label, path: path.join(skillDir, "SKILL.md") });
  }

  return installed;
}

async function copySkillFolder(source, destination, skillDir) {
  await fs.mkdir(destination, { recursive: true });

  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copySkillFolder(from, to, skillDir);
    } else if (entry.name === "SKILL.md") {
      const template = await fs.readFile(from, "utf8");
      await fs.writeFile(to, template.replaceAll("{{SKILL_DIR}}", skillDir), "utf8");
    } else {
      await fs.copyFile(from, to);
    }
  }
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
