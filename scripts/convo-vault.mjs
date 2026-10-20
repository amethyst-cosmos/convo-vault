#!/usr/bin/env node

// Convo Vault command line: export a ChatGPT conversation without touching the
// selector panel. Agent skills (Claude, Codex) call this same entry point.

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG_DIR, readConfig, writeConfig } from "./lib/cli-config.mjs";
import { extensionsPageUrl, findBrowser, listInstalledBrowsers, openInBrowser } from "./lib/cli-browser.mjs";
import {
  BACKEND_URL,
  backendDependenciesInstalled,
  createJob,
  downloadJobBundle,
  ensureBackend,
  getHealth,
  getJob,
  repoRoot,
  stopBackend
} from "./lib/cli-backend.mjs";
import { installClaudeDesktopMcp, mcpSnippets } from "./lib/cli-mcp.mjs";
import { installSkill, skillStatus } from "./lib/cli-skill.mjs";
import { extractZip, readZip } from "./lib/zip-reader.mjs";

const CLAIM_TIMEOUT_MS = 25_000;
const EXPORT_TIMEOUT_MS = 15 * 60_000;
const POLL_INTERVAL_MS = 700;

const HELP = `Convo Vault CLI

Usage:
  convo-vault export <chatgpt-url|conversation-id> [options]
  convo-vault setup [--agents auto|claude|codex|all] [--browser NAME] [--no-open]
  convo-vault verify [--browser NAME]
  convo-vault update
  convo-vault doctor
  convo-vault skill install [--agents auto|claude|codex|all]
  convo-vault mcp install [--client claude-desktop]   (or: mcp config)
  convo-vault backend start|stop|status

Export options:
  --out DIR            Where to save (default: ~/Downloads/convo-vault)
  --mode MODE          fast (default) | hybrid | full
  --browser NAME       Chrome, Edge, Brave... (default: the one that worked last time)
  --no-extract         Keep only the .zip
  --no-pdf             Data only: skip the PDF (faster, needs no headless Chrome)
  --keep-tab           Leave the ChatGPT tab open after exporting
  --allow-incomplete   Export even if the integrity gate reports gaps
  --timeout SECONDS    Give up after this long (default: 900)
`;

const log = (message) => process.stderr.write(`[convo-vault] ${message}\n`);

try {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);

  switch (command) {
    case "export": await exportConversation(positional[0], flags); break;
    case "setup": await setup(flags); break;
    case "verify": await verify(flags); break;
    case "update": await update(flags); break;
    case "doctor": await doctor(); break;
    case "skill":
      if (positional[0] !== "install") throw new Error("Usage: convo-vault skill install");
      await printSkillInstall(flags.agents || "auto");
      break;
    case "mcp": await mcpCommand(positional[0], flags); break;
    case "backend": await backendCommand(positional[0]); break;
    case undefined: case "help": case "--help": console.log(HELP); break;
    default: throw new Error(`Unknown command "${command}".\n\n${HELP}`);
  }
} catch (error) {
  process.stderr.write(`Error: ${error.message || error}\n`);
  process.exit(1);
}

function parseArgs(args) {
  const positional = [];
  const flags = {};
  const valued = new Set(["out", "mode", "browser", "timeout", "agents", "client"]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const negated = key.match(/^no([A-Z].*)$/);
    if (negated) {
      // --no-extract, --no-open, --no-pdf
      flags[negated[1][0].toLowerCase() + negated[1].slice(1)] = false;
    } else if (valued.has(key)) {
      if (index + 1 >= args.length) throw new Error(`--${arg.slice(2)} needs a value.`);
      flags[key] = args[index + 1];
      index += 1;
    } else {
      flags[key] = true;
    }
  }

  return { positional, flags };
}

// ChatGPT accepts /c/<id> on chatgpt.com and the older chat.openai.com, also under /g/... projects.
function parseConversation(input) {
  const text = String(input || "").trim();
  if (!text) throw new Error("Give a chatgpt.com/c/<id> link or a conversation id.\n\n" + HELP);

  if (/^[a-z0-9][a-z0-9-]{7,}$/i.test(text) && !text.includes(".")) {
    return `https://chatgpt.com/c/${text}`;
  }

  let url;
  try { url = new URL(text); } catch { throw new Error(`"${text}" is not a ChatGPT conversation link or id.`); }
  if (!["chatgpt.com", "chat.openai.com"].includes(url.hostname)) {
    throw new Error(`Only chatgpt.com conversations are supported (got ${url.hostname}).`);
  }
  if (!/\/c\/[a-z0-9-]{8,}/i.test(url.pathname)) {
    throw new Error("That link is not a conversation (it needs /c/<id> in the address).");
  }
  return `${url.origin}${url.pathname}`;
}

async function exportConversation(input, flags) {
  const conversationUrl = parseConversation(input);
  const captureMode = flags.mode || "fast";
  if (!["fast", "hybrid", "full"].includes(captureMode)) throw new Error("--mode must be fast, hybrid or full.");

  const config = await readConfig();
  const outDir = path.resolve(flags.out || config.outDir || path.join(os.homedir(), "Downloads", "convo-vault"));
  const candidates = await browserCandidates(flags.browser || config.browser);
  const timeoutMs = flags.timeout ? Number(flags.timeout) * 1000 : EXPORT_TIMEOUT_MS;

  await ensureBackend(log);

  let jobId = "";
  let usedBrowser = null;

  for (const browser of candidates) {
    jobId = await createJob({
      captureMode,
      allowIncomplete: flags.allowIncomplete === true,
      closeTab: flags.keepTab !== true,
      pdf: flags.pdf !== false
    });
    log(`Opening the conversation in ${browser?.name || "the default browser"}...`);
    openInBrowser(`${conversationUrl}#convo-vault-job=${jobId}`, browser);

    if (await waitForClaim(jobId, candidates.length > 1 ? CLAIM_TIMEOUT_MS : CLAIM_TIMEOUT_MS * 2)) {
      usedBrowser = browser;
      break;
    }
    log(`${browser?.name || "The browser"} did not respond.`);
  }

  if (!usedBrowser && jobId && !(await wasClaimed(jobId))) {
    throw new Error([
      "The Convo Vault extension did not pick up the job.",
      "Check that (1) the extension is loaded in your browser (run: node \"" + path.join(repoRoot, "scripts", "convo-vault.mjs") + "\" setup),",
      "(2) that browser is signed in to ChatGPT, and (3) pass --browser NAME if you use a different one."
    ].join("\n"));
  }

  if (usedBrowser && usedBrowser.name !== config.browser) await writeConfig({ browser: usedBrowser.name });

  const job = await waitForDone(jobId, timeoutMs);
  const zipBytes = await downloadJobBundle(jobId);
  await fs.mkdir(outDir, { recursive: true });
  const zipPath = await uniquePath(path.join(outDir, job.result.filename));
  await fs.writeFile(zipPath, zipBytes);

  let folder = "";
  let files = [];
  if (flags.extract !== false) {
    folder = zipPath.replace(/\.zip$/i, "");
    extractZip(readZip(zipPath), folder);
    files = (await fs.readdir(folder)).sort();
  }

  console.log(`Exported: ${conversationUrl}`);
  console.log(`Zip:      ${zipPath}`);
  if (folder) {
    console.log(`Folder:   ${folder}`);
    for (const file of files) console.log(`  ${file}`);
  }
}

async function browserCandidates(preferredName) {
  if (preferredName) {
    const browser = findBrowser(preferredName);
    if (!browser) throw new Error(`Unknown browser "${preferredName}". Try Chrome, Edge or Brave.`);
    return [browser];
  }
  const installed = listInstalledBrowsers();
  return installed.length ? installed : [null];
}

async function wasClaimed(jobId) {
  return (await getJob(jobId)).state !== "waiting";
}

async function waitForClaim(jobId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await wasClaimed(jobId)) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function waitForDone(jobId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastMessage = "";

  while (Date.now() < deadline) {
    const job = await getJob(jobId);
    if (job.message !== lastMessage) {
      lastMessage = job.message;
      log(job.message);
    }
    if (job.state === "done") return job;
    if (job.state === "error") throw new Error(job.message);
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("Timed out waiting for the export. The conversation tab may still be working; check the browser.");
}

async function uniquePath(target) {
  const { dir, name, ext } = path.parse(target);
  for (let attempt = 0; ; attempt += 1) {
    const candidate = attempt ? path.join(dir, `${name} (${attempt})${ext}`) : target;
    if (!(await fs.stat(candidate).then(() => true, () => false))) return candidate;
  }
}

async function setup(flags) {
  if (Number(process.versions.node.split(".")[0]) < 20) throw new Error(`Node 20+ is required (this is ${process.version}).`);

  if (backendDependenciesInstalled()) {
    log("Renderer dependencies already installed.");
  } else {
    log("Installing renderer dependencies...");
    const cwd = path.join(repoRoot, "renderer");
    const usePnpm = spawnSync("pnpm", ["--version"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;
    const args = usePnpm ? ["install", "--frozen-lockfile"] : ["install", "--omit=dev"];
    const result = spawnSync(usePnpm ? "pnpm" : "npm", args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    if (result.status !== 0) throw new Error("Installing renderer dependencies failed.");
  }

  const extensionDir = await ensureExtensionBuilt();
  const installed = await installSkill(flags.agents || "auto");
  const browsers = listInstalledBrowsers();
  const browser = flags.browser ? findBrowser(flags.browser) : browsers[0] || null;
  if (flags.browser && !browser) throw new Error(`Unknown browser "${flags.browser}".`);
  if (browser) await writeConfig({ browser: browser.name });

  console.log("");
  console.log("Convo Vault is ready.");
  console.log(`  Renderer:  dependencies installed`);
  console.log(`  Skill:     ${installed.length ? installed.map((item) => item.label).join(", ") : "no agent found (use: skill install --agents all)"}`);
  console.log(`  Extension: ${extensionDir}`);
  console.log("");
  console.log("One manual step, once: load the extension in your browser.");
  console.log("  1. Open the Extensions page and turn on Developer mode.");
  console.log("  2. Click Load unpacked and choose the Extension folder above.");
  console.log("  3. Sign in to ChatGPT in that browser.");
  console.log("Then check it: node scripts/convo-vault.mjs verify");
  console.log("After that, ask your agent to export a conversation, or run: convo-vault export <link>");

  if (browser && flags.open !== false) {
    openInBrowser(extensionsPageUrl(browser), browser);
    if (process.platform === "darwin") spawnSync("open", [extensionDir]);
  }
}

async function ensureExtensionBuilt() {
  const builtDir = path.join(repoRoot, "dist", "convo-vault-extension");
  const hasSource = await fs.stat(path.join(repoRoot, "extension", "content", "index.js")).then(() => true, () => false);

  if (hasSource) {
    const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "build-extension.mjs")], { cwd: repoRoot, stdio: "ignore" });
    if (result.status !== 0) throw new Error("Building the extension failed. Run: npm run build:extension");
  }

  if (!(await fs.stat(path.join(builtDir, "manifest.json")).then(() => true, () => false))) {
    throw new Error("The extension build is missing. Run: npm run build:extension");
  }

  return builtDir;
}

// Opens a ChatGPT page with a ping job: proves the extension is loaded in the browser.
async function verify(flags) {
  const config = await readConfig();
  const candidates = await browserCandidates(flags.browser || config.browser);
  await ensureBackend(log);

  for (const browser of candidates) {
    const jobId = await createJob({ ping: true, closeTab: true });
    log(`Checking the extension in ${browser?.name || "the default browser"}...`);
    openInBrowser(`https://chatgpt.com/#convo-vault-job=${jobId}`, browser);

    if (await waitForClaim(jobId, CLAIM_TIMEOUT_MS)) {
      if (browser) await writeConfig({ browser: browser.name });
      console.log(`OK: the Convo Vault extension answered in ${browser?.name || "your browser"}.`);
      console.log("Exports also need that browser to be signed in to ChatGPT.");
      return;
    }
  }

  throw new Error([
    "No browser answered. Load the extension: open the browser's Extensions page, turn on Developer mode,",
    `click Load unpacked and choose ${path.join(repoRoot, "dist", "convo-vault-extension")}. Then run verify again.`
  ].join("\n"));
}

// Pulls the latest code (git checkouts only), then repeats setup so the skill and extension match.
async function update(flags) {
  if (!(await fs.stat(path.join(repoRoot, ".git")).then(() => true, () => false))) {
    throw new Error("This copy is not a git checkout. Download the newest release zip from GitHub, or clone the repository.");
  }

  log("Pulling the latest version...");
  const pull = spawnSync("git", ["pull", "--ff-only"], { cwd: repoRoot, stdio: "inherit" });
  if (pull.status !== 0) throw new Error("git pull failed. Resolve it in the repository folder and run update again.");

  await stopBackend();
  await setup({ ...flags, open: false });
  console.log("\nUpdated. If the extension was already loaded, reload it on the browser's Extensions page.");
}

async function printSkillInstall(target) {
  const installed = await installSkill(target);
  if (!installed.length) {
    console.log("No Claude or Codex folder found. Use --agents all to create the skill folders anyway.");
    return;
  }
  for (const item of installed) console.log(`Installed for ${item.label}: ${item.path}`);
}

async function doctor() {
  const rows = [];
  const add = (ok, label, detail = "") => rows.push(`${ok ? "OK  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
  const config = await readConfig();
  const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, "extension", "manifest.json"), "utf8"));

  add(Number(process.versions.node.split(".")[0]) >= 20, "Node 20+", process.version);
  add(backendDependenciesInstalled(), "Renderer dependencies", backendDependenciesInstalled() ? "" : "run: setup");

  const health = await getHealth();
  add(Boolean(health?.capabilities?.includes("jobs")) || !health, "Renderer", health ? `running v${health.version} at ${BACKEND_URL}` : "not running (starts automatically on export)");

  const builtManifest = await fs.readFile(path.join(repoRoot, "dist", "convo-vault-extension", "manifest.json"), "utf8").then(JSON.parse, () => null);
  add(builtManifest?.version === manifest.version, "Extension build", builtManifest ? `v${builtManifest.version} (source v${manifest.version})` : "missing, run: setup");

  const browsers = listInstalledBrowsers();
  add(browsers.length > 0, "Browser", browsers.map((browser) => browser.name).join(", ") || "none found");
  add(true, "Preferred browser", config.browser || "not chosen yet (first export tries each installed browser)");

  for (const skill of await skillStatus()) add(skill.installed, `Skill for ${skill.label}`, skill.installed ? skill.path : "run: skill install");

  console.log(rows.join("\n"));
  console.log(`\nConfig: ${CONFIG_DIR}`);
  console.log("The extension itself cannot be checked from here: if exports time out, load dist/convo-vault-extension and sign in to ChatGPT.");
  if (rows.some((row) => row.startsWith("FAIL"))) process.exitCode = 1;
}

// Chat apps that run local MCP servers can export conversations without a terminal agent.
async function mcpCommand(action, flags) {
  if (action === "install" && (flags.client || "claude-desktop") === "claude-desktop") {
    const file = await installClaudeDesktopMcp();
    console.log(`Added the convo-vault MCP server to ${file} (previous file saved as .bak).`);
    console.log("Fully quit and reopen Claude desktop, then say: export this ChatGPT conversation <link or screenshot>.");
  } else if (action === "config" || action === "install") {
    console.log(mcpSnippets());
  } else {
    throw new Error("Usage: convo-vault mcp install [--client claude-desktop] | convo-vault mcp config");
  }
}

async function backendCommand(action) {
  if (action === "start") {
    const health = await ensureBackend(log);
    console.log(`Renderer running v${health.version} at ${BACKEND_URL}`);
  } else if (action === "stop") {
    console.log((await stopBackend()) ? "Renderer stopped." : "Renderer was not running, or refused the stop request.");
  } else if (action === "status") {
    const health = await getHealth();
    console.log(health ? `Running v${health.version} at ${BACKEND_URL}` : "Not running.");
  } else {
    throw new Error("Usage: convo-vault backend start|stop|status");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
