import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BACKEND_URL, repoRoot } from "./backend.mjs";

// ego lite is a Chromium browser that local programs can drive through its ego-browser command.
// Exports run there without the extension: see ego-lite-driver.mjs.

/**
 * Path of the ego-browser command, or "" when ego lite is not installed.
 * CONVO_VAULT_EGO_BROWSER overrides it; set to "" it turns ego lite off.
 */
export function egoLiteCommand() {
  if (process.env.CONVO_VAULT_EGO_BROWSER !== undefined) return process.env.CONVO_VAULT_EGO_BROWSER;

  const lookup = spawnSync(process.platform === "win32" ? "where" : "which", ["ego-browser"], { encoding: "utf8" });
  const found = lookup.status === 0 ? lookup.stdout.split(/\r?\n/)[0].trim() : "";
  if (found) return found;

  const fallback = process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || "", "ego", "bin", "ego-browser.exe")
    : path.join(os.homedir(), ".local", "bin", "ego-browser");
  return existsSync(fallback) ? fallback : "";
}

/**
 * Runs the jobs in `url` (#convo-vault-job=<ids>) in ego lite, in the background. Progress and
 * results go through the renderer's job records, as they do for the extension.
 */
export function openInEgoLite(url) {
  const command = egoLiteCommand();
  if (!command) throw new Error("ego lite is not installed (the ego-browser command was not found).");

  // The page runs the built content script, so it must match the source.
  if (existsSync(path.join(repoRoot, "extension", "content", "index.js"))) {
    const build = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "build-extension.mjs")], { cwd: repoRoot, stdio: "ignore" });
    if (build.status !== 0) throw new Error("Building the extension failed. Run: npm run build:extension");
  }

  const driver = pathToFileURL(path.join(repoRoot, "cli", "lib", "ego-lite-driver.mjs")).href;
  const script = [
    `const { runEgoLiteJobs } = await import(${JSON.stringify(driver)});`,
    `await runEgoLiteJobs({ taskSpace, url: ${JSON.stringify(url)}, repoRoot: ${JSON.stringify(repoRoot)}, rendererUrl: ${JSON.stringify(BACKEND_URL)}, log: (message) => console.error("[convo-vault] " + message) });`
  ].join("\n");

  const cacheDir = path.join(repoRoot, ".convo-vault");
  mkdirSync(cacheDir, { recursive: true });
  const logFile = openSync(path.join(cacheDir, "ego-lite.log"), "a");
  spawn(command, ["nodejs", "-e", script], { detached: true, stdio: ["ignore", logFile, logFile], windowsHide: true }).unref();
}
