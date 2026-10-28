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
      const all = [...run.stderr.matchAll(/(https:\/\/[^\s#]+)#convo-vault-job=([a-f0-9,]+)/g)];
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
  const run = await startCli(t, ["list", "--project", "Research", "--json"]);
  const tab = await run.nextTab();
  assert.equal(tab.jobIds.length, 1);

  const claimed = await run.claim(tab.jobIds[0]);
  assert.equal(claimed.options.list.project, "Research");
  assert.equal(claimed.options.conversationId, "", "a list job exports nothing");
  await run.sendResult(tab.jobIds[0], claimed, {
    source: "api",
    project: { id: "g-p-" + "1".repeat(32), name: "Research" },
    conversations: [{ id: "11111111-2222-4333-8444-555555555555", title: "季度报告初稿", updatedAt: "2026-10-22T00:03:02Z" }],
    notes: []
  });

  assert.equal(await run.exited, 0, run.stderr);
  const printed = JSON.parse(run.stdout);
  assert.equal(printed.project.name, "Research");
  assert.equal(printed.conversations[0].title, "季度报告初稿");
});

test("export --project lists the project first, then exports everything in one tab with files only where named", async (t) => {
  const run = await startCli(t, ["export", "--project", "Research", "--files-for", "发票,报告", "--no-pdf", "--no-extract"]);

  const listTab = await run.nextTab();
  const listClaim = await run.claim(listTab.jobIds[0]);
  assert.equal(listClaim.options.list.project, "Research");
  await run.sendResult(listTab.jobIds[0], listClaim, {
    project: { id: "g-p-" + "1".repeat(32), name: "Research" },
    conversations: [
      { id: "00000000-0000-4000-8000-000000000001", title: "会议纪要整理" },
      { id: "00000000-0000-4000-8000-000000000002", title: "发票对账" },
      { id: "00000000-0000-4000-8000-000000000003", title: "季度报告初稿" }
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

const GROK_A = "8cf3ca89-1360-4ff5-ba2c-5133f69e1a23";
const GROK_B = "0f1e2d3c-4b5a-4968-8776-655443322110";

test("a Grok link opens a grok.com tab, without the ?rid anchor, and exports like any other", async (t) => {
  const run = await startCli(t, ["export", `https://grok.com/c/${GROK_A}?rid=7eb01f11-a913`, "--no-pdf", "--no-extract"]);
  const tab = await run.nextTab();

  assert.equal(tab.url, `https://grok.com/c/${GROK_A}`);
  const claimed = await run.claim(tab.jobIds[0]);
  assert.equal(claimed.options.pdf, false);
  await run.finishExport(tab.jobIds[0], claimed, "Grok chat.zip");

  assert.equal(await run.exited, 0, run.stderr);
  assert.match(run.stdout, /Exported: https:\/\/grok\.com\/c\//);
  assert.deepEqual(await readdir(run.outDir), ["Grok chat.zip"]);
});

test("several Grok links run in one grok.com tab, each job naming its conversation", async (t) => {
  const run = await startCli(t, ["export", `https://grok.com/c/${GROK_A}`, `https://grok.com/c/${GROK_B}`, "--no-pdf", "--no-extract"]);
  const tab = await run.nextTab();

  assert.equal(tab.jobIds.length, 2);
  assert.equal(tab.url, `https://grok.com/c/${GROK_A}`);
  const options = [];
  for (const [index, jobId] of tab.jobIds.entries()) {
    const claimed = await run.claim(jobId);
    options.push(claimed.options);
    await run.finishExport(jobId, claimed, `Grok ${index + 1}.zip`);
  }

  assert.deepEqual(options.map((option) => option.conversationId), [GROK_A, GROK_B]);
  assert.equal(await run.exited, 0, run.stderr);
  assert.match(run.stdout, /Exported 2 of 2 conversation/);
});

test("ChatGPT and Grok links given together get one tab per site", async (t) => {
  const run = await startCli(t, ["export", "--browser", "chrome", "fixture-conv-aaaa", `https://grok.com/c/${GROK_A}`, "fixture-conv-bbbb", "--no-pdf", "--no-extract"]);
  const tabs = [];

  while (tabs.length < 2) {
    const tab = await run.nextTab();
    const claimed = await run.claim(tab.jobIds[0]);

    if (claimed.options.ping) {
      await rawRequest(run.port, "POST", `/jobs/${tab.jobIds[0]}/status`, claimed.headers, JSON.stringify({ state: "working", message: `Extension ${manifestVersion} is installed and responding.` }));
      continue;
    }

    tabs.push({ url: tab.url, jobs: tab.jobIds.length });
    await run.finishExport(tab.jobIds[0], claimed, `Site ${tabs.length}.zip`);
    for (const jobId of tab.jobIds.slice(1)) {
      await run.finishExport(jobId, await run.claim(jobId), `Site ${tabs.length} more.zip`);
    }
  }

  assert.equal(tabs[0].url, "https://chatgpt.com/c/fixture-conv-aaaa");
  assert.equal(tabs[0].jobs, 2, "both ChatGPT links share the first tab");
  assert.equal(tabs[1].url, `https://grok.com/c/${GROK_A}`);
  assert.equal(tabs[1].jobs, 1);
  assert.equal(await run.exited, 0, run.stderr);
  assert.match(run.stdout, /Exported 2 of 2 conversation/);
  assert.match(run.stdout, /Exported 1 of 1 conversation/);
});

test("a link from another site is refused and names the supported ones", async (t) => {
  const run = await startCli(t, ["export", "https://claude.ai/chat/ee7a64284d74cdd1"]);

  assert.equal(await run.exited, 1);
  assert.match(run.stderr, /Only chatgpt\.com, grok\.com and gemini\.google\.com conversations are supported \(got claude\.ai\)/);
});

const GEMINI_A = "ee7a64284d74cdd1";
const GEMINI_B = "9f8e7d6c5b4a3210";

test("a Gemini link opens a gemini.google.com tab and keeps the account part of the path", async (t) => {
  const run = await startCli(t, ["export", `https://gemini.google.com/u/1/app/${GEMINI_A}?hl=en`, "--no-pdf", "--no-extract"]);
  const tab = await run.nextTab();

  assert.equal(tab.url, `https://gemini.google.com/u/1/app/${GEMINI_A}`);
  const claimed = await run.claim(tab.jobIds[0]);
  await run.finishExport(tab.jobIds[0], claimed, "Gemini chat.zip");

  assert.equal(await run.exited, 0, run.stderr);
  assert.match(run.stdout, /Exported: https:\/\/gemini\.google\.com\/u\/1\/app\//);
});

test("several Gemini links each get their own tab, one after another, with a summary", async (t) => {
  const run = await startCli(t, ["export", `https://gemini.google.com/app/${GEMINI_A}`, `https://gemini.google.com/app/${GEMINI_B}`, "--no-pdf", "--no-extract"]);
  const tabs = [];

  while (tabs.length < 2) {
    const tab = await run.nextTab();
    const claimed = await run.claim(tab.jobIds[0]);

    // After the first export the CLI knows the browser and checks the extension version once.
    if (claimed.options.ping) {
      await rawRequest(run.port, "POST", `/jobs/${tab.jobIds[0]}/status`, claimed.headers, JSON.stringify({ state: "working", message: `Extension ${manifestVersion} is installed and responding.` }));
      continue;
    }

    tabs.push(tab);
    assert.equal(tab.jobIds.length, 1, "a page-based site cannot share one tab between conversations");
    await run.finishExport(tab.jobIds[0], claimed, `Gemini ${tabs.length}.zip`);
  }

  assert.deepEqual(tabs.map((tab) => tab.url), [`https://gemini.google.com/app/${GEMINI_A}`, `https://gemini.google.com/app/${GEMINI_B}`]);
  assert.equal(await run.exited, 0, run.stderr);
  assert.match(run.stdout, /Exported 2 of 2 conversation\(s\) from gemini\.google\.com/);
});

test("a Gemini link that is not a conversation is refused", async (t) => {
  const run = await startCli(t, ["export", "https://gemini.google.com/app"]);

  assert.equal(await run.exited, 1);
  assert.match(run.stderr, /not a Gemini conversation \(it needs \/app\/<id>/);
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
