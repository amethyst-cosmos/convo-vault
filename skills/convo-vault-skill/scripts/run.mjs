#!/usr/bin/env node

// Runs the Convo Vault CLI with the arguments given here. It finds the project
// (environment variable, the path recorded by `setup`, or the usual places) and
// installs it from GitHub when it is not there, so this skill folder works on
// its own wherever it is saved.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_URL = "https://github.com/amethyst-cosmos/convo-vault.git";
const configDir = process.env.CONVO_VAULT_HOME || path.join(os.homedir(), ".convo-vault");

const isProject = (dir) => Boolean(dir) && existsSync(path.join(dir, "cli", "convo-vault.mjs"));

function recordedProject() {
  try {
    return JSON.parse(readFileSync(path.join(configDir, "config.json"), "utf8")).repo || "";
  } catch {
    return "";
  }
}

function findProject() {
  return [
    process.env.CONVO_VAULT_DIR,
    recordedProject(),
    path.join(os.homedir(), "convo-vault")
  ].find(isProject) || "";
}

// Files only a developer needs; nobody running the tool downloads them.
const SPARSE_EXCLUDES = ["!/tests/", "!/docs/", "!/.github/", "!/AGENTS.md", "!/CONTRIBUTING.md", "!/eslint.config.mjs"];

// A shallow clone without the developer-only files. Git too old for sparse checkout gets the whole thing.
function cloneProject(target) {
  const clone = spawnSync("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", REPO_URL, target], { stdio: "inherit" });

  if (clone.status === 0) {
    const sparse = spawnSync("git", ["-C", target, "sparse-checkout", "set", "--no-cone", "/*", ...SPARSE_EXCLUDES], { stdio: "inherit" });
    if (sparse.status === 0) return true;
    // This clone is ours (git refuses a folder that already has files), so it is safe to start over.
    rmSync(target, { recursive: true, force: true });
  }

  return spawnSync("git", ["clone", "--depth", "1", REPO_URL, target], { stdio: "inherit" }).status === 0;
}

function installProject() {
  const target = process.env.CONVO_VAULT_DIR || path.join(os.homedir(), "convo-vault");
  console.error(`[convo-vault] Not installed yet. Cloning ${REPO_URL} into ${target} ...`);
  if (!cloneProject(target)) {
    console.error("Could not clone the project. Install git, or download a release zip from https://github.com/amethyst-cosmos/convo-vault/releases and set CONVO_VAULT_DIR to the unzipped folder.");
    process.exit(1);
  }

  const setup = spawnSync(process.execPath, [path.join(target, "cli", "convo-vault.mjs"), "setup"], { stdio: "inherit" });

  if (setup.status !== 0) {
    process.exit(setup.status ?? 1);
  }

  return target;
}

const project = findProject() || installProject();
const result = spawnSync(process.execPath, [path.join(project, "cli", "convo-vault.mjs"), ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
