import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { readZip } from "../cli/lib/zip-reader.mjs";
import http from "node:http";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cliPath = path.join(repoRoot, "cli", "convo-vault.mjs");
const fixture = JSON.parse(await readFile(path.join(repoRoot, "tests", "fixtures", "multilingual-export.payload.json"), "utf8"));

test("CLI exports a conversation through the extension job flow", async (t) => {
  const port = await getAvailablePort();
  const base = `http://127.0.0.1:${port}`;
  const home = await mkdtemp(path.join(os.tmpdir(), "convo-vault-cli-home-"));
  const outDir = await mkdtemp(path.join(os.tmpdir(), "convo-vault-cli-out-"));
  const env = {
    ...process.env,
    CONVO_VAULT_HOME: home,
    CGCE_ADVANCED_PDF_PORT: String(port),
    CONVO_VAULT_NO_OPEN: "1"
  };

  t.after(async () => {
    await rawRequest(port, "POST", "/shutdown").catch(() => {});
    await rm(home, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  });

  const cli = spawn(process.execPath, [cliPath, "export", "https://chatgpt.com/c/fixture-conversation-1", "--out", outDir], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  cli.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  cli.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve) => cli.on("exit", resolve));

  const jobId = await waitFor(() => stderr.match(/#convo-vault-job=([a-f0-9]{48})/)?.[1], () => stderr);

  // A web page (Origin set, or Sec-Fetch-Site set) must not drive jobs.
  assert.equal((await rawRequest(port, "POST", "/jobs", { Origin: "https://chatgpt.com" }, "{}")).status, 403);
  assert.equal((await rawRequest(port, "GET", `/jobs/${jobId}`, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await rawRequest(port, "POST", `/jobs/${jobId}/claim`, { Origin: "https://chatgpt.com" })).status, 403);
  assert.equal((await rawRequest(port, "POST", `/jobs/${jobId}/claim`)).status, 403);

  // The extension claims the job once and receives the renderer token.
  const claimed = await rawRequest(port, "POST", `/jobs/${jobId}/claim`, { Origin: "chrome-extension://test" });
  assert.equal(claimed.status, 200);
  const { token, options } = JSON.parse(claimed.body);
  assert.equal(options.closeTab, true);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal((await rawRequest(port, "POST", `/jobs/${jobId}/claim`, { Origin: "chrome-extension://test" })).status, 409);
  assert.equal((await rawRequest(port, "POST", `/jobs/${jobId}/status`, { Origin: "chrome-extension://test" }, "{}")).status, 401);

  const headers = { "Content-Type": "application/json", "X-Convo-Vault-Token": token, Origin: "chrome-extension://test" };
  await rawRequest(port, "POST", `/jobs/${jobId}/status`, headers, JSON.stringify({ state: "working", message: "Scanning" }));
  assert.equal(JSON.parse((await rawRequest(port, "GET", `/jobs/${jobId}`)).body).message, "Scanning");

  const prepared = await fetch(`${base}/prepare-render-bundle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Convo-Vault-Token": token },
    body: JSON.stringify({ jobId, exportPayload: fixture, fileName: "Fixture conversation.zip" })
  });
  assert.equal(prepared.ok, true, await prepared.clone().text());

  assert.equal(await exited, 0, stderr);
  assert.match(stdout, /Zip:\s+.*Fixture conversation\.zip/);
  const folder = await readdir(path.join(outDir, "Fixture conversation"));
  assert.ok(folder.some((name) => name.endsWith(".md")), folder.join(", "));
  assert.ok(folder.some((name) => name.endsWith(".pdf")), folder.join(", "));
});

test("--no-pdf exports a data-only bundle without needing a PDF renderer", async (t) => {
  const port = await getAvailablePort();
  const home = await mkdtemp(path.join(os.tmpdir(), "convo-vault-cli-home-"));
  const outDir = await mkdtemp(path.join(os.tmpdir(), "convo-vault-cli-out-"));
  t.after(async () => {
    await rawRequest(port, "POST", "/shutdown").catch(() => {});
    await rm(home, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  });

  const cli = spawn(process.execPath, [cliPath, "export", "fixture-conversation-2", "--out", outDir, "--no-pdf", "--files", "--no-extract"], {
    cwd: repoRoot,
    env: { ...process.env, CONVO_VAULT_HOME: home, CGCE_ADVANCED_PDF_PORT: String(port), CONVO_VAULT_NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  cli.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  cli.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve) => cli.on("exit", resolve));

  const jobId = await waitFor(() => stderr.match(/#convo-vault-job=([a-f0-9]{48})/)?.[1], () => stderr);
  const claimed = JSON.parse((await rawRequest(port, "POST", `/jobs/${jobId}/claim`, { Origin: "chrome-extension://test" })).body);
  assert.equal(claimed.options.pdf, false);
  assert.equal(claimed.options.files, true, "--files asks the extension to download uploaded and generated files");

  const prepared = await fetch(`http://127.0.0.1:${port}/prepare-render-bundle`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Convo-Vault-Token": claimed.token },
    body: JSON.stringify({ jobId, skipPdf: true, exportPayload: fixture, fileName: "Data only.zip" })
  });
  assert.equal(prepared.ok, true, await prepared.clone().text());

  assert.equal(await exited, 0, stderr);
  const names = (await readdir(outDir)).sort();
  assert.deepEqual(names, ["Data only.zip"], "--no-extract keeps only the zip");
  const entries = readZip(path.join(outDir, "Data only.zip")).entries.map((entry) => entry.name);
  assert.ok(entries.some((name) => name.endsWith(".md")));
  assert.ok(entries.some((name) => name.endsWith(".messages.jsonl")));
  assert.ok(!entries.some((name) => name.endsWith(".pdf")), entries.join(", "));
});

test("the renderer started for the CLI exits by itself when idle", async () => {
  const port = await getAvailablePort();
  const server = spawn(process.execPath, [path.join(repoRoot, "renderer", "server.js")], {
    cwd: repoRoot,
    env: { ...process.env, CGCE_ADVANCED_PDF_PORT: String(port), CGCE_IDLE_EXIT_MS: "800" },
    stdio: "ignore"
  });
  const exit = await Promise.race([
    new Promise((resolve) => server.on("exit", (code) => resolve(code))),
    new Promise((resolve) => setTimeout(() => resolve("still running"), 8000))
  ]);
  if (exit === "still running") server.kill();
  assert.equal(exit, 0);
});

const manifestVersion = JSON.parse(await readFile(path.join(repoRoot, "extension", "manifest.json"), "utf8")).version;

// Runs `verify` against a simulated extension that claims the ping job and then reports `statusMessage`
// (null = claims only, like an extension that sends no status at all).
async function verifyWithSimulatedExtension(t, statusMessage) {
  const port = await getAvailablePort();
  const home = await mkdtemp(path.join(os.tmpdir(), "convo-vault-cli-home-"));
  t.after(async () => {
    await rawRequest(port, "POST", "/shutdown").catch(() => {});
    await rm(home, { recursive: true, force: true });
  });

  const cli = spawn(process.execPath, [cliPath, "verify", "--browser", "chrome"], {
    cwd: repoRoot,
    env: { ...process.env, CONVO_VAULT_HOME: home, CGCE_ADVANCED_PDF_PORT: String(port), CONVO_VAULT_NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  cli.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  cli.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve) => cli.on("exit", resolve));

  const jobId = await waitFor(() => stderr.match(/#convo-vault-job=([a-f0-9]{48})/)?.[1], () => stderr);
  const claimed = JSON.parse((await rawRequest(port, "POST", `/jobs/${jobId}/claim`, { Origin: "chrome-extension://test" })).body);
  assert.equal(claimed.options.ping, true);

  if (statusMessage) {
    const headers = { "Content-Type": "application/json", "X-Convo-Vault-Token": claimed.token, Origin: "chrome-extension://test" };
    await rawRequest(port, "POST", `/jobs/${jobId}/status`, headers, JSON.stringify({ state: "working", message: statusMessage }));
  }

  const status = await exited;
  return { status, stdout, stderr };
}

test("verify prints the extension version and stays quiet when it matches the project", async (t) => {
  const result = await verifyWithSimulatedExtension(t, `Extension ${manifestVersion} is installed and responding.`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`OK: Extension ${manifestVersion.replaceAll(".", "\\.")} answered in `));
  assert.doesNotMatch(result.stdout, /reload/i);
});

test("verify hints to reload when the extension is not the project's version", async (t) => {
  const result = await verifyWithSimulatedExtension(t, "Extension 0.0.1 is installed and responding.");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK: Extension 0\.0\.1 answered in /);
  assert.ok(result.stdout.includes(`this project is ${manifestVersion}`), result.stdout);
  assert.match(result.stdout, /convo-vault\.mjs" reload/);
});

test("verify still succeeds with an old extension that sends no version", async (t) => {
  const result = await verifyWithSimulatedExtension(t, "Extension is installed and responding.");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK: the Convo Vault extension answered in /);
  assert.match(result.stdout, /older extension/);
});

test("verify succeeds once the extension claims a ping job, even if it never reports a status", async (t) => {
  const result = await verifyWithSimulatedExtension(t, null);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /the Convo Vault extension answered/);
});

test("setup keeps going when the skill folders cannot be written, and --no-skill skips them", async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), "convo-vault-setup-home-"));
  const config = await mkdtemp(path.join(os.tmpdir(), "convo-vault-setup-config-"));
  t.after(async () => {
    await rm(home, { recursive: true, force: true });
    await rm(config, { recursive: true, force: true });
  });
  // A file where ~/.claude should be makes writing the skill fail on every platform and for root as well.
  await writeFile(path.join(home, ".claude"), "not a folder");
  const env = { HOME: home, USERPROFILE: home, CONVO_VAULT_HOME: config };

  const failing = await run(["setup", "--agents", "claude", "--browser", "chrome", "--no-open"], env);
  assert.equal(failing.status, 0, failing.stderr);
  assert.match(failing.stderr, /Warning: could not install the skill/);
  assert.match(failing.stdout, /Convo Vault is ready\./);
  assert.match(failing.stdout, /Skill:\s+not installed/);
  assert.match(failing.stdout, /Load unpacked/);
  assert.equal(JSON.parse(await readFile(path.join(config, "config.json"), "utf8")).repo, repoRoot);

  await rm(path.join(config, "config.json"));
  const skipped = await run(["setup", "--agents", "claude", "--browser", "chrome", "--no-open", "--no-skill"], env);
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.doesNotMatch(skipped.stderr, /Warning/);
  assert.match(skipped.stdout, /Skill:\s+skipped \(--no-skill\)/);
  assert.equal(JSON.parse(await readFile(path.join(config, "config.json"), "utf8")).repo, repoRoot);
});

test("CLI rejects links that are not ChatGPT conversations", async () => {
  for (const input of ["https://example.com/c/abcdefgh", "https://chatgpt.com/", "not a link"]) {
    const result = await run(["export", input]);
    assert.notEqual(result.status, 0, input);
    assert.match(result.stderr, /Error:/);
  }
});

test("the skill folder installs anywhere, with its own path in SKILL.md and a launcher that finds the project", async (t) => {
  const target = await mkdtemp(path.join(os.tmpdir(), "convo-vault-skill-"));
  t.after(() => rm(target, { recursive: true, force: true }));

  const template = await readFile(path.join(repoRoot, "skills", "convo-vault-skill", "SKILL.md"), "utf8");
  assert.match(template, /^---\nname: convo-vault-skill\ndescription: .+\n---\n/);
  assert.ok(template.includes('node "{{SKILL_DIR}}/scripts/run.mjs" export'));

  const installed = await run(["skill", "install", "--dir", target]);
  assert.equal(installed.status, 0, installed.stderr);

  const skillDir = path.join(target, "convo-vault-skill");
  const skill = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
  assert.ok(skill.includes(`node "${skillDir}/scripts/run.mjs" export`), "SKILL.md carries the folder path");
  assert.ok(!skill.includes("{{SKILL_DIR}}"));
  assert.match(await readFile(path.join(skillDir, "agents", "openai.yaml"), "utf8"), /display_name: "Convo Vault Skill"/);

  // The copied launcher runs the project's CLI (found through CONVO_VAULT_DIR).
  const help = spawnSync(process.execPath, [path.join(skillDir, "scripts", "run.mjs"), "help"], {
    encoding: "utf8",
    env: { ...process.env, CONVO_VAULT_DIR: repoRoot }
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /convo-vault export/);
});

test("installing the skill removes the old convo-vault folder, and only when it is this skill", async (t) => {
  const target = await mkdtemp(path.join(os.tmpdir(), "convo-vault-skill-legacy-"));
  t.after(() => rm(target, { recursive: true, force: true }));
  await mkdir(path.join(target, "convo-vault"), { recursive: true });
  await writeFile(path.join(target, "convo-vault", "SKILL.md"), "---\nname: convo-vault\ndescription: old\n---\n");
  await mkdir(path.join(target, "other"), { recursive: true });

  assert.equal((await run(["skill", "install", "--dir", target])).status, 0);
  assert.equal(await stat(path.join(target, "convo-vault")).then(() => true, () => false), false, "old folder removed");
  assert.equal(await stat(path.join(target, "convo-vault-skill", "SKILL.md")).then(() => true, () => false), true);
  assert.equal(await stat(path.join(target, "other")).then(() => true, () => false), true, "other folders untouched");
});

function run(args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd: repoRoot, env: { ...process.env, CONVO_VAULT_NO_OPEN: "1", ...extraEnv } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("exit", (status) => resolve({ status, stdout, stderr }));
  });
}

function rawRequest(port, method, route, headers = {}, body = "") {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, method, path: route, headers: { ...headers, "Content-Length": Buffer.byteLength(body) } }, (response) => {
      let data = "";
      response.setEncoding("utf8").on("data", (chunk) => { data += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body: data }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function waitFor(read, getLogs, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out. Output so far:\n${getLogs()}`);
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
