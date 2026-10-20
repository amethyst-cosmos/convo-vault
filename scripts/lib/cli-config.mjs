import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// CONVO_VAULT_HOME moves the config folder (tests use it instead of faking the home directory).
export const CONFIG_DIR = process.env.CONVO_VAULT_HOME || path.join(os.homedir(), ".convo-vault");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export async function readConfig() {
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export async function writeConfig(patch) {
  const next = { ...(await readConfig()), ...patch };
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
