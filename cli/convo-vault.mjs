#!/usr/bin/env node

// Convo Vault command line: export a ChatGPT conversation without touching the
// selector panel. Agent skills (Claude, Codex) call this same entry point.

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONFIG_DIR, readConfig, writeConfig } from "./lib/config.mjs";
import { extensionsPageUrl, findBrowser, listInstalledBrowsers, openInBrowser } from "./lib/browser.mjs";
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
} from "./lib/backend.mjs";
import { installClaudeDesktopMcp, mcpSnippets } from "./lib/mcp.mjs";
import { installSkill, skillStatus } from "./lib/skill.mjs";
import { extractZip, readZip } from "./lib/zip-reader.mjs";

const CLAIM_TIMEOUT_MS = 25_000;
const EXPORT_TIMEOUT_MS = 15 * 60_000;
const POLL_INTERVAL_MS = 700;
const CONVERSATION_HOSTS = ["chatgpt.com", "chat.openai.com", "grok.com", "gemini.google.com"];
const GEMINI_ORIGIN = "https://gemini.google.com";

const HELP = `Convo Vault CLI

Usage:
  convo-vault export <chatgpt-grok-or-gemini-url|conversation-id>... [options]
  convo-vault export --project NAME [options]
  convo-vault list [--project NAME|ID|URL] [--limit N] [--json]
  convo-vault setup [--agents auto|claude|codex|all] [--browser NAME] [--no-open] [--no-skill]
  convo-vault verify [--browser NAME]
  convo-vault update
  convo-vault reload [--browser NAME]
  convo-vault doctor
  convo-vault skill install [--agents auto|claude|codex|all] [--dir FOLDER]
  convo-vault mcp install [--client claude-desktop]   (or: mcp config)
  convo-vault backend start|stop|status

Export options:
  --out DIR            Where to save (default: ~/Downloads/convo-vault)
  --browser NAME       Chrome, Edge, Brave... (default: the one that worked last time)
  --no-extract         Keep only the .zip
  --no-pdf             Data only: skip the PDF (faster, needs no headless Chrome)
  --files              Also download uploaded and generated files (Word, PDF, zip...) into assets/files/
  --files-for A,B      Only for the conversations whose title contains A or B (or whose id is A or B)
  --project NAME       Export every conversation in that project (a name, id or project link)
  --keep-tab           Leave the ChatGPT tab open after exporting
  --allow-incomplete   Export even if the integrity gate reports gaps
  --timeout SECONDS    Give up after this long (default: 900)

Environment:
  CONVO_VAULT_HOME     Config folder (default: ~/.convo-vault)
`;

const log = (message) => process.stderr.write(`[convo-vault] ${message}\n`);

try {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);

  switch (command) {
    case "export": await exportCommand(positional, flags); break;
    case "list": await listCommand(flags); break;
    case "setup": await setup(flags); break;
    case "verify": await verify(flags); break;
    case "update": await update(flags); break;
    case "reload": await reloadExtension(flags); break;
    case "doctor": await doctor(); break;
    case "skill":
      if (positional[0] !== "install") throw new Error("Usage: convo-vault skill install");
      await printSkillInstall(flags.agents || "auto", flags.dir);
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
  const valued = new Set(["out", "browser", "timeout", "agents", "client", "dir", "project", "filesFor", "limit"]);

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
// Grok uses /c/<id> on grok.com. Gemini uses /app/<id> (also /u/1/app/<id> for a second account, and
// /gem/<gem>/<id>). A bare id is a ChatGPT id; a Grok or Gemini conversation needs its link.
function parseConversation(input) {
  const text = String(input || "").trim();
  if (!text) throw new Error("Give a chatgpt.com/c/<id> link or a conversation id.\n\n" + HELP);

  if (/^[a-z0-9][a-z0-9-]{7,}$/i.test(text) && !text.includes(".")) {
    return `https://chatgpt.com/c/${text}`;
  }

  let url;
  try { url = new URL(text); } catch { throw new Error(`"${text}" is not a ChatGPT conversation link or id.`); }
  if (!CONVERSATION_HOSTS.includes(url.hostname)) {
    throw new Error(`Only chatgpt.com, grok.com and gemini.google.com conversations are supported (got ${url.hostname}).`);
  }
  if (url.hostname === "gemini.google.com") {
    if (!/^\/(?:u\/\d+\/)?(?:app\/[a-z0-9_-]{8,}|gem\/[^/]+\/[a-z0-9_-]{8,})\/?$/i.test(url.pathname)) {
      throw new Error("That link is not a Gemini conversation (it needs /app/<id> in the address).");
    }
  } else if (!/\/c\/[a-z0-9-]{8,}/i.test(url.pathname)) {
    throw new Error("That link is not a conversation (it needs /c/<id> in the address).");
  }
  return `${url.origin}${url.pathname}`;
}

async function exportConversation(input, flags) {
  const conversationUrl = parseConversation(input);

  const config = await readConfig();
  const outDir = path.resolve(flags.out || config.outDir || path.join(os.homedir(), "Downloads", "convo-vault"));
  const candidates = await browserCandidates(flags.browser || config.browser);
  const timeoutMs = flags.timeout ? Number(flags.timeout) * 1000 : EXPORT_TIMEOUT_MS;

  await ensureBackend(log);

  // Only a browser that has answered before is checked (the remembered one, or --browser).
  if (candidates.length === 1 && candidates[0] && (flags.browser || config.browser)) {
    await refreshStaleExtension(candidates[0]);
  }

  let jobId = "";
  let usedBrowser = null;

  for (const browser of candidates) {
    jobId = await createJob({
      allowIncomplete: flags.allowIncomplete === true,
      closeTab: flags.keepTab !== true,
      pdf: flags.pdf !== false,
      files: flags.files === true
    });
    log(`Opening the conversation in ${browser?.name || "the default browser"}...`);
    openInBrowser(`${conversationUrl}#convo-vault-job=${jobId}`, browser, { background: true });

    if (await waitForClaim(jobId, candidates.length > 1 ? CLAIM_TIMEOUT_MS : CLAIM_TIMEOUT_MS * 2)) {
      usedBrowser = browser;
      break;
    }
    log(`${browser?.name || "The browser"} did not respond.`);
  }

  if (!usedBrowser && jobId && !(await wasClaimed(jobId))) {
    throw new Error([
      "The Convo Vault extension did not pick up the job.",
      "Check that (1) the extension is loaded in your browser (run: node \"" + path.join(repoRoot, "cli", "convo-vault.mjs") + "\" setup),",
      "(2) that browser is signed in to ChatGPT, and (3) pass --browser NAME if you use a different one."
    ].join("\n"));
  }

  if (usedBrowser && usedBrowser.name !== config.browser) await writeConfig({ browser: usedBrowser.name });

  const job = await waitForDone(jobId, timeoutMs);
  const saved = await saveJobBundle(jobId, job, outDir, flags);

  console.log(`Exported: ${conversationUrl}`);
  printSaved(saved, "");
}

// Downloads a finished job's bundle into outDir and unpacks it unless --no-extract.
async function saveJobBundle(jobId, job, outDir, flags) {
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

  return { zipPath, folder, files };
}

function printSaved({ zipPath, folder, files }, indent) {
  console.log(`${indent}Zip:      ${zipPath}`);
  if (folder) {
    console.log(`${indent}Folder:   ${folder}`);
    for (const file of files) console.log(`${indent}  ${file}`);
  }
}

// `export` takes one link (the original path), several links, or a whole project. Several
// conversations run in ONE browser tab, one after another, so nothing pops up per conversation.
async function exportCommand(inputs, flags) {
  if (inputs.length === 1 && !flags.project && !flags.filesFor) {
    await exportConversation(inputs[0], flags);
    return;
  }

  if (!inputs.length && !flags.project) {
    throw new Error("Give one or more chatgpt.com/c/<id> links, or --project NAME.\n\n" + HELP);
  }

  const targets = [];
  const addTarget = (origin, id, title) => {
    if (!targets.some((target) => target.id === id && target.origin === origin)) targets.push({ origin, id, title: title || "" });
  };

  for (const input of inputs) {
    const url = new URL(parseConversation(input));
    // Gemini is read from the page, so each conversation needs its own page: the path is its id.
    addTarget(url.origin, url.origin === GEMINI_ORIGIN ? url.pathname : url.pathname.match(/\/c\/([a-z0-9_-]{8,})/i)[1], "");
  }

  if (flags.project) {
    const listing = await requestConversationList({ project: String(flags.project), limit: 2000 }, flags);
    log(`Project "${listing.project?.name || flags.project}": ${listing.conversations.length} conversation(s).`);
    for (const conversation of listing.conversations) addTarget("https://chatgpt.com", conversation.id, conversation.title);
  }

  if (!targets.length) throw new Error("There is no conversation to export.");

  // One browser tab per site: a batch runs inside the tab of the site its conversations belong to.
  const origins = [...new Set(targets.map((target) => target.origin))];
  for (const origin of origins) {
    try {
      const group = targets.filter((target) => target.origin === origin);
      if (origin === GEMINI_ORIGIN) await exportOneByOne(group, flags);
      else await exportBatch(group, flags, origin);
    } catch (error) {
      console.log(`\nFAILED (${new URL(origin).hostname}): ${error.message}`);
      process.exitCode = 1;
    }
  }
}

// Gemini conversations are read from the page, so a tab cannot move from one to the next the way a
// batch does for the API-based sites: each opens its own tab, one after another.
async function exportOneByOne(group, flags) {
  let exported = 0;

  for (const [index, target] of group.entries()) {
    console.log(`[${index + 1}/${group.length}] ${GEMINI_ORIGIN}${target.id}`);
    try {
      await exportConversation(`${GEMINI_ORIGIN}${target.id}`, flags);
      exported += 1;
    } catch (error) {
      console.log(`  FAILED: ${error.message}`);
      process.exitCode = 1;
    }
  }

  console.log(`\nExported ${exported} of ${group.length} conversation(s) from gemini.google.com.`);
}

// True when --files-for names this conversation: by id, or by a word from its title.
function matchesFilesFor(filesFor, target) {
  const terms = String(filesFor === true ? "" : filesFor || "").split(",").map((term) => term.trim().toLowerCase()).filter(Boolean);
  return terms.some((term) => target.id.toLowerCase() === term || (target.title && target.title.toLowerCase().includes(term)));
}

async function exportBatch(targets, flags, origin = "https://chatgpt.com") {
  const config = await readConfig();
  const outDir = path.resolve(flags.out || config.outDir || path.join(os.homedir(), "Downloads", "convo-vault"));
  const candidates = await browserCandidates(flags.browser || config.browser);
  const timeoutMs = flags.timeout ? Number(flags.timeout) * 1000 : EXPORT_TIMEOUT_MS;

  await ensureBackend(log);

  if (candidates.length === 1 && candidates[0] && (flags.browser || config.browser)) {
    await refreshStaleExtension(candidates[0]);
  }

  const jobs = [];
  for (const [index, target] of targets.entries()) {
    const files = flags.files === true || matchesFilesFor(flags.filesFor, target);
    const jobId = await createJob({
      conversationId: target.id,
      allowIncomplete: flags.allowIncomplete === true,
      // The tab stays open until the last conversation is done.
      closeTab: flags.keepTab !== true && index === targets.length - 1,
      pdf: flags.pdf !== false,
      files
    });
    jobs.push({ ...target, jobId, files });
  }

  let started = false;
  for (const browser of candidates) {
    log(`Opening one ${new URL(origin).hostname} tab in ${browser?.name || "the default browser"} for ${jobs.length} conversation(s)...`);
    openInBrowser(`${origin}/c/${jobs[0].id}#convo-vault-job=${jobs.map((job) => job.jobId).join(",")}`, browser, { background: true });

    if (await waitForClaim(jobs[0].jobId, candidates.length > 1 ? CLAIM_TIMEOUT_MS : CLAIM_TIMEOUT_MS * 2)) {
      if (browser && browser.name !== config.browser) await writeConfig({ browser: browser.name });
      started = true;
      break;
    }
    log(`${browser?.name || "The browser"} did not respond.`);
  }

  if (!started) {
    throw new Error([
      "The Convo Vault extension did not pick up the jobs.",
      "Check that (1) the extension is loaded in your browser (run: node \"" + path.join(repoRoot, "cli", "convo-vault.mjs") + "\" setup),",
      "(2) that browser is signed in to ChatGPT, and (3) pass --browser NAME if you use a different one."
    ].join("\n"));
  }

  const outcomes = [];
  let lastProgressAt = Date.now();

  for (const [index, job] of jobs.entries()) {
    const label = `[${index + 1}/${jobs.length}] ${job.title || job.id}`;
    try {
      const done = await waitForBatchJob(job.jobId, timeoutMs, () => lastProgressAt, label);
      const saved = await saveJobBundle(job.jobId, done, outDir, flags);
      console.log(`${label}\n  Exported: ${origin}/c/${job.id}${job.files ? " (with files)" : ""}`);
      printSaved(saved, "  ");
      outcomes.push({ ...job, ok: true, saved });
    } catch (error) {
      console.log(`${label}\n  FAILED: ${error.message}`);
      outcomes.push({ ...job, ok: false, error: error.message });
    }
    lastProgressAt = Date.now();
  }

  const failed = outcomes.filter((outcome) => !outcome.ok);
  console.log(`\nExported ${outcomes.length - failed.length} of ${outcomes.length} conversation(s).`);
  for (const outcome of failed) console.log(`  FAILED ${outcome.title || outcome.id}: ${outcome.error}`);
  if (failed.length) process.exitCode = 1;
}

// Waits for one job of a batch. A job still waiting long after the one before it finished means
// the tab stopped processing the batch (it was closed, or ChatGPT signed out), so it fails
// instead of waiting out the full export timeout for every remaining conversation.
async function waitForBatchJob(jobId, timeoutMs, getLastProgressAt, label) {
  const deadline = Date.now() + timeoutMs;
  let lastMessage = "";

  while (Date.now() < deadline) {
    const job = await getJob(jobId);
    if (job.message !== lastMessage) {
      lastMessage = job.message;
      log(`${label}: ${job.message}`);
    }
    if (job.state === "done") return job;
    if (job.state === "error") throw new Error(job.message);
    if (job.state === "waiting" && Date.now() - getLastProgressAt() > CLAIM_TIMEOUT_MS * 2) {
      throw new Error("The browser tab stopped processing the batch (was it closed?).");
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("Timed out waiting for this conversation.");
}

// Asks the extension for a list of conversations (all, or one project's) and returns it.
async function requestConversationList(request, flags) {
  const config = await readConfig();
  const candidates = await browserCandidates(flags.browser || config.browser);
  await ensureBackend(log);

  if (candidates.length === 1 && candidates[0] && (flags.browser || config.browser)) {
    await refreshStaleExtension(candidates[0]);
  }

  for (const browser of candidates) {
    const jobId = await createJob({ list: request, closeTab: true });
    log(`Listing conversations in ${browser?.name || "the default browser"}...`);
    openInBrowser(`https://chatgpt.com/#convo-vault-job=${jobId}`, browser, { background: true });

    if (await waitForClaim(jobId, candidates.length > 1 ? CLAIM_TIMEOUT_MS : CLAIM_TIMEOUT_MS * 2)) {
      if (browser && browser.name !== config.browser) await writeConfig({ browser: browser.name });
      const job = await waitForDone(jobId, 2 * 60_000);
      if (!job.data?.conversations) throw new Error("The extension answered, but sent no conversation list.");
      for (const note of job.data.notes || []) log(note);
      return job.data;
    }
  }

  throw new Error("The Convo Vault extension did not pick up the job. Run: node \"" + path.join(repoRoot, "cli", "convo-vault.mjs") + "\" verify");
}

async function listCommand(flags) {
  const limit = flags.limit ? Number(flags.limit) : 200;
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit needs a whole number of 1 or more.");

  const listing = await requestConversationList({ project: flags.project ? String(flags.project) : "", limit }, flags);

  if (flags.json) {
    console.log(JSON.stringify(listing, null, 2));
    return;
  }

  console.log(listing.project ? `Project: ${listing.project.name || listing.project.id}` : "All conversations");
  for (const conversation of listing.conversations) {
    console.log(`${conversation.id}  ${String(conversation.updatedAt || "").slice(0, 10).padEnd(10)}  ${conversation.title || "(untitled)"}`);
  }
  console.log(`${listing.conversations.length} conversation(s).`);
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
  const skill = await installSkillBestEffort(flags);
  const browsers = listInstalledBrowsers();
  const browser = flags.browser ? findBrowser(flags.browser) : browsers[0] || null;
  if (flags.browser && !browser) throw new Error(`Unknown browser "${flags.browser}".`);
  // The skill finds this project again through the recorded path.
  await writeConfig({ repo: repoRoot, ...(browser ? { browser: browser.name } : {}) });

  console.log("");
  console.log("Convo Vault is ready.");
  console.log(`  Renderer:  dependencies installed`);
  console.log(`  Skill:     ${skill.summary}`);
  console.log(`  Extension: ${extensionDir}`);
  console.log("");
  console.log("One manual step, once: load the extension in your browser.");
  console.log("  1. Open the Extensions page and turn on Developer mode.");
  console.log("  2. Click Load unpacked and choose the Extension folder above.");
  console.log("  3. Sign in to ChatGPT in that browser.");
  console.log("Then check it: node cli/convo-vault.mjs verify");
  console.log("After that, ask your agent to export a conversation, or run: convo-vault export <link>");

  if (browser && flags.open !== false) {
    openInBrowser(extensionsPageUrl(browser), browser);
    if (process.platform === "darwin") spawnSync("open", [extensionDir]);
  }
}

// The skill lives in folders outside the project (~/.claude, ~/.codex). An agent sandboxed to its
// working folder cannot write there, and that must not stop the rest of setup.
async function installSkillBestEffort(flags) {
  if (flags.skill === false) return { summary: "skipped (--no-skill); install later with: skill install" };

  try {
    const installed = await installSkill(flags.agents || "auto");
    return { summary: installed.length ? installed.map((item) => item.label).join(", ") : "no agent found (use: skill install --agents all)" };
  } catch (error) {
    log(`Warning: could not install the skill (${error.code || error.message}). Setup continues without it.`);
    log("Run \"skill install\" later from a shell that may write ~/.claude and ~/.codex, or use \"skill install --dir FOLDER\".");
    return { summary: "not installed (see the warning above)" };
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
    openInBrowser(`https://chatgpt.com/#convo-vault-job=${jobId}`, browser, { background: true });

    if (await waitForClaim(jobId, CLAIM_TIMEOUT_MS)) {
      if (browser) await writeConfig({ browser: browser.name });
      const version = await waitForPingVersion(jobId);
      const where = browser?.name || "your browser";
      console.log(version ? `OK: Extension ${version} answered in ${where}.` : `OK: the Convo Vault extension answered in ${where}.`);
      const expected = await sourceVersion();
      if (version && expected && version !== expected) {
        console.log(`The extension in the browser is ${version}, but this project is ${expected}. Run: node "${path.join(repoRoot, "cli", "convo-vault.mjs")}" reload`);
        console.log("If that does not answer, click the reload icon on the browser's Extensions page.");
      } else if (!version) {
        console.log("This is an older extension that does not report its version. Reload it once on the Extensions page to update it.");
      }
      console.log("Exports also need that browser to be signed in to ChatGPT.");
      return;
    }
  }

  throw new Error([
    "No browser answered. Open the browser's Extensions page. If Convo Vault is listed but switched off, turn it on and click its reload icon.",
    `If it is not listed, turn on Developer mode, click Load unpacked and choose ${path.join(repoRoot, "dist", "convo-vault-extension")}. Then run verify again.`
  ].join("\n"));
}

// The ping job's status message carries the extension version once it has been sent.
// Old extensions send no version, so this gives up quietly after a few seconds.
async function waitForPingVersion(jobId) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const job = await getJob(jobId);
    const version = job.message?.match(/^Extension (\d+\.\d+\.\d+\S*) is installed/)?.[1];
    if (version) return version;
    if (job.message === "Extension is installed and responding.") return "";
    await sleep(200);
  }
  return "";
}

async function sourceVersion() {
  const manifest = await fs.readFile(path.join(repoRoot, "extension", "manifest.json"), "utf8").then(JSON.parse, () => null);
  return manifest?.version || "";
}

// Asks the extension in one browser to reload itself. True once it took the job.
async function reloadExtensionIn(browser) {
  const jobId = await createJob({ reload: true, closeTab: true });
  log(`Asking the extension in ${browser?.name || "the default browser"} to reload...`);
  openInBrowser(`https://chatgpt.com/#convo-vault-job=${jobId}`, browser, { background: true });

  if (!(await waitForClaim(jobId, CLAIM_TIMEOUT_MS))) return false;
  await sleep(1500);
  return true;
}

// Asks the extension in one browser which version it is.
async function pingExtension(browser) {
  const jobId = await createJob({ ping: true, closeTab: true });
  openInBrowser(`https://chatgpt.com/#convo-vault-job=${jobId}`, browser, { background: true });

  if (!(await waitForClaim(jobId, CLAIM_TIMEOUT_MS))) return { answered: false, version: "" };
  return { answered: true, version: await waitForPingVersion(jobId) };
}

// Makes the loaded extension reload itself, so a rebuilt dist/ takes effect without a click.
// Needs a version that already knows the reload job; older ones must be reloaded by hand once.
async function reloadExtension(flags) {
  const config = await readConfig();
  const candidates = await browserCandidates(flags.browser || config.browser);
  await ensureBackend(log);

  for (const browser of candidates) {
    if (await reloadExtensionIn(browser)) {
      console.log("The extension reloaded itself.");
      return;
    }
  }

  throw new Error("The extension did not answer. If this is the first time after an update, reload it by hand once on the extensions page; after that this command works.");
}

// After the project was updated (by `update`, a git pull or a skill), the browser may still run the
// old extension. Reload it here so nobody has to click reload on the Extensions page. It asks once per
// project version, and only for a browser that has answered before, so a first export pays nothing.
async function refreshStaleExtension(browser) {
  const expected = await sourceVersion();
  const config = await readConfig();
  if (!expected || config.extensionVersionChecked === expected) return;

  const found = await pingExtension(browser);
  // No answer: the export itself reports a missing or switched-off extension.
  if (!found.answered) return;

  if (found.version === expected) {
    await writeConfig({ extensionVersionChecked: expected });
    return;
  }

  log(`The extension is ${found.version || "an older version"} and this project is ${expected}. Reloading the extension...`);
  const built = await fs.readFile(path.join(repoRoot, "dist", "convo-vault-extension", "manifest.json"), "utf8").then(JSON.parse, () => null);
  if (built?.version !== expected) await ensureExtensionBuilt();

  if (!(await reloadExtensionIn(browser))) {
    log("The extension did not take the reload. Reload it once by hand on the browser's Extensions page; after that it updates by itself.");
    return;
  }

  const after = await pingExtension(browser);
  if (after.answered && after.version === expected) {
    await writeConfig({ extensionVersionChecked: expected });
    log(`The extension is now ${expected}.`);
  } else {
    log(`The extension still reports ${after.version || "no version"}. Click its reload icon on the browser's Extensions page.`);
  }
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
  try {
    await reloadExtension(flags);
  } catch (error) {
    console.log(`\nUpdated. ${error.message}`);
    return;
  }
  console.log("\nUpdated.");
}

async function printSkillInstall(target, dir) {
  const installed = await installSkill(target, { dir });
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
