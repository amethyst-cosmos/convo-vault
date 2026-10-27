import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import http from "node:http";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cliPath = path.join(repoRoot, "cli", "convo-vault.mjs");
const fixture = JSON.parse(await readFile(path.join(repoRoot, "tests", "fixtures", "multilingual-export.payload.json"), "utf8"));
const EXTENSION = { Origin: "chrome-extension://test" };
const manifestVersion = JSON.parse(await readFile(path.join(repoRoot, "extension", "manifest.json"), "utf8")).version;

// Starts the CLI against its own renderer, with no browser: each job the CLI creates is answered by
// the test, playing the extension. Job ids appear in stderr as #convo-vault-job=<id>[,<id>...].
async function startCli(t, args) {
  const port = await getAvailablePort();
  const home = await mkdtemp(path.join(os.tmpdir(), "convo-vault-batch-home-"));
  const outDir = await mkdtemp(path.join(os.tmpdir(), "convo-vault-batch-out-"));
  t.after(async () => {
    await rawRequest(port, "POST", "/shutdown").catch(() => {});
    await rm(home, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  });

  const cli = spawn(process.execPath, [cliPath, ...args, "--out", outDir], {
    cwd: repoRoot,
    env: { ...process.env, CONVO_VAULT_HOME: home, CGCE_ADVANCED_PDF_PORT: String(port), CONVO_VAULT_NO_OPEN: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const run = { port, outDir, stdout: "", stderr: "", seen: new Set() };
  cli.stdout.setEncoding("utf8").on("data", (chunk) => { run.stdout += chunk; });
  cli.stderr.setEncoding("utf8").on("data", (chunk) => { run.stderr += chunk; });
  run.exited = new Promise((resolve) => cli.on("exit", resolve));

  // The job ids of the next browser tab the CLI opened.
  run.nextTab = async () => {
    const urls = await waitFor(() => {
      const all = [...run.stderr.matchAll(/(https:\/\/chatgpt\.com\/[^\s#]*)#convo-vault-job=([a-f0-9,]+)/g)];
      const fresh = all.find((match) => !run.seen.has(match[2]));
      return fresh || null;
    }, () => run.stderr);
    run.seen.add(urls[2]);
    return { url: urls[1], jobIds: urls[2].split(",") };
  };

  run.claim = async (jobId) => {
    const response = await rawRequest(port, "POST", `/jobs/${jobId}/claim`, EXTENSION);
    assert.equal(response.status, 200, response.body);
    const claimed = JSON.parse(response.body);
    return { ...claimed, headers: { "Content-Type": "application/json", "X-Convo-Vault-Token": claimed.token, ...EXTENSION } };
  };

  run.finishExport = async (jobId, claimed, fileName) => {
    const prepared = await fetch(`http://127.0.0.1:${port}/prepare-render-bundle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Convo-Vault-Token": claimed.token },
      body: JSON.stringify({ jobId, skipPdf: true, exportPayload: fixture, fileName })
    });
    assert.equal(prepared.ok, true, await prepared.clone().text());
  };

  run.sendResult = async (jobId, claimed, data) => {
    const response = await rawRequest(port, "POST", `/jobs/${jobId}/result`, claimed.headers, JSON.stringify({ data }));
    assert.equal(response.status, 200, response.body);
  };

  return run;
}

test("several links export in ONE tab, each job names its conversation, and --files-for picks the ones with files", async (t) => {
  const run = await startCli(t, ["export", "fixture-conv-aaaa", "https://chatgpt.com/c/fixture-conv-bbbb", "fixture-conv-cccc", "--no-pdf", "--no-extract", "--files-for", "fixture-conv-bbbb"]);

  const tab = await run.nextTab();
  assert.equal(tab.jobIds.length, 3, "one tab carries all three jobs");
  assert.ok(tab.url.endsWith("/c/fixture-conv-aaaa"), tab.url);

  const options = [];
  for (const [index, jobId] of tab.jobIds.entries()) {
    const claimed = await run.claim(jobId);
    options.push(claimed.options);
    await run.finishExport(jobId, claimed, `Batch ${"ABC"[index]}.zip`);
  }

  assert.deepEqual(options.map((option) => option.conversationId), ["fixture-conv-aaaa", "fixture-conv-bbbb", "fixture-conv-cccc"]);
  assert.deepEqual(options.map((option) => option.files), [false, true, false]);
  assert.deepEqual(options.map((option) => option.closeTab), [false, false, true], "the tab closes after the last conversation only");

  assert.equal(await run.exited, 0, run.stderr);
  assert.match(run.stdout, /Exported 3 of 3 conversation/);
  assert.deepEqual((await readdir(run.outDir)).sort(), ["Batch A.zip", "Batch B.zip", "Batch C.zip"]);
});

test("one failing conversation is reported, the others are kept, and the exit code says so", async (t) => {
  const run = await startCli(t, ["export", "fixture-conv-aaaa", "fixture-conv-bbbb", "--no-pdf", "--no-extract"]);
  const tab = await run.nextTab();

  const first = await run.claim(tab.jobIds[0]);
  await rawRequest(run.port, "POST", `/jobs/${tab.jobIds[0]}/status`, first.headers, JSON.stringify({ state: "error", message: "Capture is incomplete" }));
  const second = await run.claim(tab.jobIds[1]);
  await run.finishExport(tab.jobIds[1], second, "Second.zip");

  assert.equal(await run.exited, 1);
  assert.match(run.stdout, /FAILED: Capture is incomplete/);
  assert.match(run.stdout, /Exported 1 of 2 conversation/);
  assert.deepEqual(await readdir(run.outDir), ["Second.zip"]);
});

test("list asks the extension for a project's conversations and prints them", async (t) => {
  const run = await startCli(t, ["list", "--project", "Working", "--json"]);
  const tab = await run.nextTab();
  assert.equal(tab.jobIds.length, 1);

  const claimed = await run.claim(tab.jobIds[0]);
  assert.equal(claimed.options.list.project, "Working");
  assert.equal(claimed.options.conversationId, "", "a list job exports nothing");
  await run.sendResult(tab.jobIds[0], claimed, {
    source: "api",
    project: { id: "g-p-" + "1".repeat(32), name: "Working" },
    conversations: [{ id: "6ad34ccd-d3f0-83ec-a4d8-786273002c00", title: "制作PPT第一页", updatedAt: "2026-10-22T00:03:02Z" }],
    notes: []
  });

  assert.equal(await run.exited, 0, run.stderr);
  const printed = JSON.parse(run.stdout);
  assert.equal(printed.project.name, "Working");
  assert.equal(printed.conversations[0].title, "制作PPT第一页");
});

test("export --project lists the project first, then exports everything in one tab with files only where named", async (t) => {
  const run = await startCli(t, ["export", "--project", "Working", "--files-for", "二手衣物,PPT", "--no-pdf", "--no-extract"]);

  const listTab = await run.nextTab();
  const listClaim = await run.claim(listTab.jobIds[0]);
  assert.equal(listClaim.options.list.project, "Working");
  await run.sendResult(listTab.jobIds[0], listClaim, {
    project: { id: "g-p-" + "1".repeat(32), name: "Working" },
    conversations: [
      { id: "00000000-0000-4000-8000-000000000001", title: "解读商业合作邀请" },
      { id: "00000000-0000-4000-8000-000000000002", title: "二手衣物测量广告整理" },
      { id: "00000000-0000-4000-8000-000000000003", title: "制作PPT第一页" }
    ],
    notes: []
  });

  // The list answered, so the CLI now knows the browser and checks the extension version once.
  const pingTab = await run.nextTab();
  const pingClaim = await run.claim(pingTab.jobIds[0]);
  assert.equal(pingClaim.options.ping, true);
  await rawRequest(run.port, "POST", `/jobs/${pingTab.jobIds[0]}/status`, pingClaim.headers, JSON.stringify({ state: "working", message: `Extension ${manifestVersion} is installed and responding.` }));

  const exportTab = await run.nextTab();
  assert.equal(exportTab.jobIds.length, 3);
  const files = [];
  for (const [index, jobId] of exportTab.jobIds.entries()) {
    const claimed = await run.claim(jobId);
    files.push(claimed.options.files);
    await run.finishExport(jobId, claimed, `Project ${index + 1}.zip`);
  }

  assert.deepEqual(files, [false, true, true], "only the two named conversations download files");
  assert.equal(await run.exited, 0, run.stderr);
  assert.match(run.stdout, /Exported 3 of 3 conversation/);
});

test("export without a link or a project explains what to give", async (t) => {
  const run = await startCli(t, ["export", "--no-pdf"]);
  assert.equal(await run.exited, 1);
  assert.match(run.stderr, /--project NAME/);
});

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

async function waitFor(read, getLogs, timeoutMs = 60_000) {
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
