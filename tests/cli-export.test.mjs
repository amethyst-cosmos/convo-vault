import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import http from "node:http";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cliPath = path.join(repoRoot, "scripts", "convo-vault.mjs");
const fixture = JSON.parse(await readFile(path.join(repoRoot, "tests", "fixtures", "multilingual-export.payload.json"), "utf8"));

test("CLI exports a conversation through the extension job flow", async (t) => {
  const port = await getAvailablePort();
  const base = `http://127.0.0.1:${port}`;
  const home = await mkdtemp(path.join(os.tmpdir(), "convo-vault-cli-home-"));
  const outDir = await mkdtemp(path.join(os.tmpdir(), "convo-vault-cli-out-"));
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
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
  assert.equal(options.captureMode, "fast");
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

test("verify succeeds once the extension claims a ping job", async (t) => {
  const port = await getAvailablePort();
  const home = await mkdtemp(path.join(os.tmpdir(), "convo-vault-cli-home-"));
  t.after(async () => {
    await rawRequest(port, "POST", "/shutdown").catch(() => {});
    await rm(home, { recursive: true, force: true });
  });

  const cli = spawn(process.execPath, [cliPath, "verify", "--browser", "chrome"], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home, CGCE_ADVANCED_PDF_PORT: String(port), CONVO_VAULT_NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  cli.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  cli.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise((resolve) => cli.on("exit", resolve));

  const jobId = await waitFor(() => stderr.match(/#convo-vault-job=([a-f0-9]{48})/)?.[1], () => stderr);
  const claimed = await rawRequest(port, "POST", `/jobs/${jobId}/claim`, { Origin: "chrome-extension://test" });
  assert.equal(JSON.parse(claimed.body).options.ping, true);

  assert.equal(await exited, 0, stderr);
  assert.match(stdout, /the Convo Vault extension answered/);
});

test("CLI rejects links that are not ChatGPT conversations", async () => {
  for (const input of ["https://example.com/c/abcdefgh", "https://chatgpt.com/", "not a link"]) {
    const result = await run(["export", input]);
    assert.notEqual(result.status, 0, input);
    assert.match(result.stderr, /Error:/);
  }
});

test("skill template points at the CLI placeholder and has valid frontmatter", async () => {
  const skill = await readFile(path.join(repoRoot, "skills", "convo-vault", "SKILL.md"), "utf8");
  assert.match(skill, /^---\nname: convo-vault\ndescription: .+\n---\n/);
  assert.ok(skill.includes('node "{{CLI}}" export'));
});

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd: repoRoot, env: { ...process.env, CONVO_VAULT_NO_OPEN: "1" } });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("exit", (status) => resolve({ status, stderr }));
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
