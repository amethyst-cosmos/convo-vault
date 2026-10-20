import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { repoRoot } from "./backend.mjs";

const SERVER_NAME = "convo-vault";

// Absolute paths: desktop apps do not inherit the shell PATH, so `node` alone may not resolve.
export function mcpServerEntry() {
  return { command: process.execPath, args: [path.join(repoRoot, "cli", "mcp-server.mjs")] };
}

export function claudeDesktopConfigPath() {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

/** Adds the server to Claude desktop's config, keeping a .bak of the previous file. */
export async function installClaudeDesktopMcp() {
  const file = claudeDesktopConfigPath();
  let config = {};

  try {
    const raw = await fs.readFile(file, "utf8");
    config = raw.trim() ? JSON.parse(raw) : {};
    await fs.copyFile(file, `${file}.bak`);
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error(`Could not read ${file}: ${error.message}`);
    await fs.mkdir(path.dirname(file), { recursive: true });
  }

  config.mcpServers = { ...(config.mcpServers || {}), [SERVER_NAME]: mcpServerEntry() };
  await fs.writeFile(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return file;
}

export function mcpSnippets() {
  const { command, args } = mcpServerEntry();
  const quoted = [command, ...args].map((part) => JSON.stringify(part)).join(" ");
  return [
    "Claude Code:",
    `  claude mcp add ${SERVER_NAME} -- ${quoted}`,
    "",
    "Codex (~/.codex/config.toml):",
    `  [mcp_servers.${SERVER_NAME}]`,
    `  command = ${JSON.stringify(command)}`,
    `  args = ${JSON.stringify(args)}`,
    "",
    "Any other client (JSON):",
    `  ${JSON.stringify({ mcpServers: { [SERVER_NAME]: { command, args } } })}`
  ].join("\n");
}
